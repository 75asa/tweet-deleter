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
  /**
   * Present (with `tweet.fields=referenced_tweets`) when this post refers to
   * another one - e.g. a Retweet has an entry with `type: "retweeted"`
   * pointing at the original post's id.
   */
  referenced_tweets?: { type: string; id: string }[];
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
  // Retweets come through as their own post with text "RT @user: ...", so
  // the existing keepTexts/keepTags checks against `text`/`entities` above
  // already apply to them unchanged - no special-casing needed here.
  if (keepTexts.some((keepText) => keepText.test(text))) return false;
  if (hashtags) {
    for (const tag of hashtags) {
      if (keepTags.includes(tag.tag)) return false;
    }
  }
  if (new Date(created_at) > boundaryDate) return false;
  return true;
};

/**
 * If `status` is a Retweet, returns the id of the post it retweets.
 *
 * docs.x.com doesn't document what `DELETE /2/tweets/:id` does when `:id` is
 * a Retweet's own id (v1.1's `statuses/destroy` used it to un-retweet, but
 * that's not confirmed for v2). To stay safe we instead use the endpoint
 * that's explicitly documented for this - `DELETE /2/users/:id/retweets/:source_tweet_id`
 * (`XClient#unretweet`) - whenever a post is a Retweet.
 */
export const getRetweetSourceId = (status: Status): string | undefined =>
  status.referenced_tweets?.find((ref) => ref.type === "retweeted")?.id;

// Pricing reference, checked against docs.x.com/x-api/getting-started/pricing
// on 2026-09-28. These are estimates for logging only (actual billing may
// differ, e.g. due to same-day de-duplication of identical reads).
const OWNED_READ_COST_USD = 0.001; // per post returned by GET /2/users/:id/tweets
const DELETE_COST_USD = 0.01; // per successful removal (DELETE /2/tweets/:id or unretweet)

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
  alreadyDeletedCount: number;
  skippedForRateLimit: number;
  skippedForCap: number;
  apiCallCount: number;
  estimatedCostUsd: number;
  dryRun: boolean;
  fullScan: boolean;
}

type RemoveOutcome = "deleted" | "already_deleted" | "gave_up";

const removeWithRetry = async (
  client: XClient,
  userId: string,
  status: Status,
  sleep: (ms: number) => Promise<void>,
  logger: Logger,
): Promise<{ outcome: RemoveOutcome; apiCalls: number }> => {
  const sourceId = getRetweetSourceId(status);
  const label = sourceId
    ? `retweet ${status.id} (source ${sourceId})`
    : `post ${status.id}`;
  const action = sourceId
    ? () => client.unretweet(userId, sourceId)
    : () => client.deleteTweet(status.id);

  let apiCalls = 0;
  // One retry after waiting out the rate limit reset; if we're still
  // rate-limited (or the wait would be too long) we stop for this run.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await action();
    apiCalls++;
    if (result.status === "deleted") {
      return { outcome: "deleted", apiCalls };
    }
    if (result.status === "already_deleted") {
      logger.log(`[ALREADY GONE] ${label} was already removed, skipping`);
      return { outcome: "already_deleted", apiCalls };
    }
    if (result.status === "failed") {
      throw new Error(`Failed to remove ${label}: ${String(result.error)}`);
    }
    const waitMs = result.resetAt.getTime() - Date.now();
    if (attempt === 1 || waitMs > MAX_RATE_LIMIT_WAIT_MS) {
      logger.log(
        `[RATE LIMITED] giving up on ${label} for this run (reset at ${result.resetAt.toISOString()})`,
      );
      return { outcome: "gave_up", apiCalls };
    }
    const boundedWaitMs = Math.max(waitMs, 0);
    logger.log(
      `[RATE LIMITED] waiting ${boundedWaitMs}ms before retrying ${label}`,
    );
    await sleep(boundedWaitMs);
  }
  return { outcome: "gave_up", apiCalls };
};

const warnIfSkipped = (
  skippedForCap: number,
  skippedForRateLimit: number,
  logger: Logger,
): void => {
  const total = skippedForCap + skippedForRateLimit;
  if (total === 0) return;
  logger.log(
    `[WARNING] ${total}件のポストが MAX_DELETES またはレート制限によりスキップされました。` +
      "LOOKBACK_DAYS の範囲外になり削除されなくなる可能性があります。dry_run で確認のうえ、" +
      "full_scan を有効にして手動実行してください。",
  );
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
    warnIfSkipped(skippedForCap, 0, logger);
    return {
      fetchedCount: fetched.length,
      deletedCount: 0,
      alreadyDeletedCount: 0,
      skippedForRateLimit: 0,
      skippedForCap,
      apiCallCount,
      estimatedCostUsd: fetched.length * OWNED_READ_COST_USD,
      dryRun: true,
      fullScan: setting.fullScan,
    };
  }

  let deletedCount = 0;
  let alreadyDeletedCount = 0;
  let skippedForRateLimit = 0;
  for (let i = 0; i < toDelete.length; i++) {
    const status = toDelete[i];
    const { outcome, apiCalls } = await removeWithRetry(
      client,
      userId,
      status,
      sleep,
      logger,
    );
    apiCallCount += apiCalls;
    if (outcome === "deleted") {
      deletedCount++;
    } else if (outcome === "already_deleted") {
      alreadyDeletedCount++;
    } else {
      skippedForRateLimit = toDelete.length - i;
      break;
    }
  }

  warnIfSkipped(skippedForCap, skippedForRateLimit, logger);

  return {
    fetchedCount: fetched.length,
    deletedCount,
    alreadyDeletedCount,
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
    "## post-deleter",
    "",
    `- fetched: ${summary.fetchedCount}`,
    `- deleted: ${summary.deletedCount}`,
    `- already gone (skipped): ${summary.alreadyDeletedCount}`,
    `- skipped (rate limited): ${summary.skippedForRateLimit}`,
    `- skipped (MAX_DELETES cap): ${summary.skippedForCap}`,
    `- dry run: ${summary.dryRun}`,
    `- full scan: ${summary.fullScan}`,
    `- API calls: ${summary.apiCallCount}`,
    `- estimated cost: $${summary.estimatedCostUsd.toFixed(3)}`,
  ];
  if (summary.skippedForCap > 0 || summary.skippedForRateLimit > 0) {
    lines.push(
      "",
      "> [!WARNING]",
      "> Some posts were skipped (MAX_DELETES cap or rate limiting) and may age out of the" +
        " `LOOKBACK_DAYS` window before the next scheduled run. Consider running this workflow" +
        " manually with `full_scan` enabled (try `dry_run` first) to catch up.",
    );
  }
  lines.push("");
  await appendFile(summaryFile, `${lines.join("\n")}\n`);
};

const main = async () => {
  const setting = settings();
  const client: XClient = new TwitterApiV2XClient(setting);
  try {
    const summary = await run({ client, setting });
    console.log(
      `[SUMMARY] fetched=${summary.fetchedCount} deleted=${summary.deletedCount} ` +
        `alreadyDeleted=${summary.alreadyDeletedCount} skippedForRateLimit=${summary.skippedForRateLimit} ` +
        `skippedForCap=${summary.skippedForCap} apiCalls=${summary.apiCallCount} ` +
        `estimatedCostUsd=${summary.estimatedCostUsd.toFixed(3)} dryRun=${summary.dryRun} ` +
        `fullScan=${summary.fullScan}`,
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
