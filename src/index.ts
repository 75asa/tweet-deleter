import { appendFile } from "node:fs/promises";
import { getDeletionBoundary } from "./boundary.ts";
import { type Setting, settings } from "./settings.ts";
import { TwitterApiV2XClient, type XClient } from "./x-client.ts";

export interface Status {
  id: string;
  text: string;
  entities: {
    hashtags?: { tag: string }[];
  };
  created_at: string;
}

export const is消したい = (
  status: Status,
  setting: Setting,
  boundaryDate: Date,
): boolean => {
  const { exceptionIds, keepTags, keepTexts } = setting;
  const {
    id,
    text,
    entities: { hashtags },
    created_at,
  } = status;
  if (exceptionIds.includes(id)) return false;
  if (keepTexts.some((keepText) => keepText.test(text))) return false;
  if (hashtags) {
    for (const tag of hashtags) {
      if (keepTags.includes(tag.tag)) return false;
    }
  }
  if (new Date(created_at) > boundaryDate) return false;
  return true;
};

// Pricing reference, checked against docs.x.com/x-api/getting-started/pricing
// on 2026-09-28. These are estimates for logging only (actual billing may
// differ, e.g. due to same-day de-duplication of identical reads).
const OWNED_READ_COST_USD = 0.001; // per post returned by GET /2/users/:id/tweets
const DELETE_COST_USD = 0.01; // per successful DELETE /2/tweets/:id

// Longest we're willing to sleep out a single 429 before giving up on the
// rest of this run's deletes (GitHub Actions jobs have limited runtime).
const MAX_RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface Logger {
  log: (message: string) => void;
}

export interface RunDeps {
  client: XClient;
  setting: Setting;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

export interface RunSummary {
  fetchedCount: number;
  deletedCount: number;
  skippedForRateLimit: number;
  skippedForCap: number;
  apiCallCount: number;
  estimatedCostUsd: number;
  dryRun: boolean;
  fullScan: boolean;
}

const deleteWithRetry = async (
  client: XClient,
  id: string,
  sleep: (ms: number) => Promise<void>,
  logger: Logger,
): Promise<{ deleted: boolean; apiCalls: number; giveUp: boolean }> => {
  let apiCalls = 0;
  // One retry after waiting out the rate limit reset; if we're still
  // rate-limited (or the wait would be too long) we stop for this run.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await client.deleteTweet(id);
    apiCalls++;
    if (result.status === "deleted") {
      return { deleted: true, apiCalls, giveUp: false };
    }
    if (result.status === "failed") {
      throw new Error(`Failed to delete tweet ${id}: ${String(result.error)}`);
    }
    const waitMs = result.resetAt.getTime() - Date.now();
    if (attempt === 1 || waitMs > MAX_RATE_LIMIT_WAIT_MS) {
      logger.log(
        `[RATE LIMITED] giving up deleting ${id} for this run (reset at ${result.resetAt.toISOString()})`,
      );
      return { deleted: false, apiCalls, giveUp: true };
    }
    const boundedWaitMs = Math.max(waitMs, 0);
    logger.log(
      `[RATE LIMITED] waiting ${boundedWaitMs}ms before retrying delete of ${id}`,
    );
    await sleep(boundedWaitMs);
  }
  return { deleted: false, apiCalls, giveUp: true };
};

export const run = async ({
  client,
  setting,
  now = new Date(),
  sleep = defaultSleep,
  logger = console,
}: RunDeps): Promise<RunSummary> => {
  const boundaryDate = getDeletionBoundary(now);
  let apiCallCount = 0;

  let userId = setting.userId;
  if (!userId) {
    userId = await client.getMyUserId();
    apiCallCount++;
  }

  const endTime = boundaryDate.toISOString();
  const startTime = setting.fullScan
    ? undefined
    : new Date(
        boundaryDate.valueOf() - setting.lookbackDays * 86400000,
      ).toISOString();

  const fetched: Status[] = [];
  let paginationToken: string | undefined;
  do {
    const page = await client.fetchTweetsPage({
      userId,
      startTime,
      endTime,
      paginationToken,
    });
    apiCallCount++;
    fetched.push(...page.tweets);
    paginationToken = page.nextToken;
  } while (paginationToken);

  const statusesToDelete = fetched.filter((status) =>
    is消したい(status, setting, boundaryDate),
  );
  const toDelete = statusesToDelete.slice(0, setting.maxDeletes);
  const skippedForCap = statusesToDelete.length - toDelete.length;

  if (setting.dryRun) {
    for (const status of toDelete) {
      logger.log(`[DRY RUN] ${status.id} ${status.text}`);
    }
    logger.log(`[DRY RUN] ${toDelete.length}個のツイートが削除対象です`);
    return {
      fetchedCount: fetched.length,
      deletedCount: 0,
      skippedForRateLimit: 0,
      skippedForCap,
      apiCallCount,
      estimatedCostUsd: fetched.length * OWNED_READ_COST_USD,
      dryRun: true,
      fullScan: setting.fullScan,
    };
  }

  let deletedCount = 0;
  let skippedForRateLimit = 0;
  for (let i = 0; i < toDelete.length; i++) {
    const status = toDelete[i];
    const { deleted, apiCalls, giveUp } = await deleteWithRetry(
      client,
      status.id,
      sleep,
      logger,
    );
    apiCallCount += apiCalls;
    if (deleted) {
      deletedCount++;
    } else if (giveUp) {
      skippedForRateLimit = toDelete.length - i;
      break;
    }
  }

  return {
    fetchedCount: fetched.length,
    deletedCount,
    skippedForRateLimit,
    skippedForCap,
    apiCallCount,
    estimatedCostUsd:
      fetched.length * OWNED_READ_COST_USD + deletedCount * DELETE_COST_USD,
    dryRun: false,
    fullScan: setting.fullScan,
  };
};

const writeStepSummary = async (summary: RunSummary): Promise<void> => {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;
  const lines = [
    "## tweet-deleter",
    "",
    `- fetched: ${summary.fetchedCount}`,
    `- deleted: ${summary.deletedCount}`,
    `- skipped (rate limited): ${summary.skippedForRateLimit}`,
    `- skipped (MAX_DELETES cap): ${summary.skippedForCap}`,
    `- dry run: ${summary.dryRun}`,
    `- full scan: ${summary.fullScan}`,
    `- API calls: ${summary.apiCallCount}`,
    `- estimated cost: $${summary.estimatedCostUsd.toFixed(3)}`,
    "",
  ].join("\n");
  await appendFile(summaryFile, `${lines}\n`);
};

const main = async () => {
  const setting = settings();
  const client: XClient = new TwitterApiV2XClient(setting);
  try {
    const summary = await run({ client, setting });
    console.log(
      `[SUMMARY] fetched=${summary.fetchedCount} deleted=${summary.deletedCount} ` +
        `skippedForRateLimit=${summary.skippedForRateLimit} skippedForCap=${summary.skippedForCap} ` +
        `apiCalls=${summary.apiCallCount} estimatedCostUsd=${summary.estimatedCostUsd.toFixed(3)} ` +
        `dryRun=${summary.dryRun} fullScan=${summary.fullScan}`,
    );
    await writeStepSummary(summary);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
};

if (import.meta.main) {
  main();
}
