import assert from "node:assert/strict";
import { test } from "node:test";
import { is消したい, run, type Status } from "./index.ts";
import type { Setting } from "./settings.ts";
import type {
  DeleteTweetResult,
  FetchTweetsPage,
  FetchTweetsParams,
  XClient,
} from "./x-client.ts";

const baseStatus: Status = {
  id: "",
  text: "",
  entities: {},
  created_at: new Date().toString(),
};

const baseSetting: Setting = {
  consumerKey: "",
  consumerSecret: "",
  accessToken: "",
  accessTokenSecret: "",
  keepTags: [],
  exceptionIds: [],
  keepTexts: [],
  lookbackDays: 7,
  maxDeletes: 50,
  fullScan: false,
  dryRun: false,
};

test("delete", () => {
  const boundaryDate = new Date();

  assert.equal(is消したい(baseStatus, baseSetting, boundaryDate), true);
});

test("keep_by_id", () => {
  const status: Status = { ...baseStatus, id: "12345" };
  const setting: Setting = { ...baseSetting, exceptionIds: ["12345"] };
  const boundaryDate = new Date();

  assert.equal(is消したい(status, setting, boundaryDate), false);
});

test("keep_by_tag", () => {
  const status: Status = {
    ...baseStatus,
    entities: { hashtags: [{ tag: "hoge" }] },
  };
  const setting: Setting = { ...baseSetting, keepTags: ["hoge"] };
  const boundaryDate = new Date();

  assert.equal(is消したい(status, setting, boundaryDate), false);
});

test("keep_by_text", () => {
  const status: Status = { ...baseStatus, text: "hogehuga" };
  const setting: Setting = { ...baseSetting, keepTexts: [/hoge/] };
  const boundaryDate = new Date();

  assert.equal(is消したい(status, setting, boundaryDate), false);
});

test("keep_by_date", () => {
  const status: Status = { ...baseStatus, created_at: new Date().toString() };
  const boundaryDate = new Date(Date.now() - 1000 * 10); // 10秒ぐらい前

  assert.equal(is消したい(status, baseSetting, boundaryDate), false);
});

// --- run() orchestration, driven by a fake XClient (no network) ---

class FakeXClient implements XClient {
  pages: FetchTweetsPage[];
  deleteResults: (DeleteTweetResult | (() => DeleteTweetResult))[];
  unretweetResults: (DeleteTweetResult | (() => DeleteTweetResult))[];
  userId: string;
  fetchCalls: FetchTweetsParams[] = [];
  deleteCalls: string[] = [];
  unretweetCalls: { userId: string; sourceTweetId: string }[] = [];
  getMyUserIdCalls = 0;

  constructor(opts: {
    pages: FetchTweetsPage[];
    deleteResults?: (DeleteTweetResult | (() => DeleteTweetResult))[];
    unretweetResults?: (DeleteTweetResult | (() => DeleteTweetResult))[];
    userId?: string;
  }) {
    this.pages = opts.pages;
    this.deleteResults = opts.deleteResults ?? [];
    this.unretweetResults = opts.unretweetResults ?? [];
    this.userId = opts.userId ?? "user-1";
  }

  async getMyUserId(): Promise<string> {
    this.getMyUserIdCalls++;
    return this.userId;
  }

  async fetchTweetsPage(params: FetchTweetsParams): Promise<FetchTweetsPage> {
    this.fetchCalls.push(params);
    const page = this.pages[this.fetchCalls.length - 1];
    if (!page) throw new Error("no more fake pages configured");
    return page;
  }

  async deleteTweet(id: string): Promise<DeleteTweetResult> {
    this.deleteCalls.push(id);
    const next = this.deleteResults[this.deleteCalls.length - 1];
    if (!next) return { status: "deleted" };
    return typeof next === "function" ? next() : next;
  }

  async unretweet(
    userId: string,
    sourceTweetId: string,
  ): Promise<DeleteTweetResult> {
    this.unretweetCalls.push({ userId, sourceTweetId });
    const next = this.unretweetResults[this.unretweetCalls.length - 1];
    if (!next) return { status: "deleted" };
    return typeof next === "function" ? next() : next;
  }
}

const noopLogger = { log: () => {} };
const noopSleep = async (_ms: number): Promise<void> => {};

const statusWithId = (id: string, createdAt: Date): Status => ({
  id,
  text: `tweet ${id}`,
  entities: {},
  created_at: createdAt.toISOString(),
});

const retweetOf = (id: string, sourceId: string, createdAt: Date): Status => ({
  id,
  text: `RT @someone: tweet ${sourceId}`,
  entities: {},
  created_at: createdAt.toISOString(),
  referenced_tweets: [{ type: "retweeted", id: sourceId }],
});

test("run: paginates until nextToken is absent", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [
      { tweets: [statusWithId("1", old)], nextToken: "token-a" },
      { tweets: [statusWithId("2", old)], nextToken: "token-b" },
      { tweets: [statusWithId("3", old)], nextToken: undefined },
    ],
  });
  const setting: Setting = { ...baseSetting, dryRun: true };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.equal(client.fetchCalls.length, 3);
  assert.equal(client.fetchCalls[1].paginationToken, "token-a");
  assert.equal(client.fetchCalls[2].paginationToken, "token-b");
  assert.equal(summary.fetchedCount, 3);
});

test("run: uses userId from setting and skips GET /2/users/me", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old)] }],
  });
  const setting: Setting = { ...baseSetting, dryRun: true, userId: "42" };

  await run({ client, setting, logger: noopLogger, sleep: noopSleep });

  assert.equal(client.getMyUserIdCalls, 0);
  assert.equal(client.fetchCalls[0].userId, "42");
});

test("run: calls GET /2/users/me when userId is not configured", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old)] }],
    userId: "me-id",
  });
  const setting: Setting = { ...baseSetting, dryRun: true };

  await run({ client, setting, logger: noopLogger, sleep: noopSleep });

  assert.equal(client.getMyUserIdCalls, 1);
  assert.equal(client.fetchCalls[0].userId, "me-id");
});

test("run: sets start_time/end_time from the deletion boundary and lookbackDays", async () => {
  const client = new FakeXClient({ pages: [{ tweets: [] }] });
  const setting: Setting = { ...baseSetting, dryRun: true, lookbackDays: 3 };
  const now = new Date("2024-06-10T12:00:00.000Z");

  await run({ client, setting, now, logger: noopLogger, sleep: noopSleep });

  const { startTime, endTime } = client.fetchCalls[0];
  assert.ok(endTime);
  assert.ok(startTime);
  const days =
    (new Date(endTime).valueOf() - new Date(startTime as string).valueOf()) /
    86400000;
  assert.equal(days, 3);
});

test("run: full scan omits start_time", async () => {
  const client = new FakeXClient({ pages: [{ tweets: [] }] });
  const setting: Setting = { ...baseSetting, dryRun: true, fullScan: true };

  await run({ client, setting, logger: noopLogger, sleep: noopSleep });

  assert.equal(client.fetchCalls[0].startTime, undefined);
});

test("run: filters fetched tweets with is消したい before deleting", async () => {
  const now = new Date("2024-06-10T00:00:00.000Z");
  const old = new Date("2020-01-01T00:00:00.000Z");
  const tooRecent = new Date("2024-06-10T00:00:00.000Z"); // after boundary, kept
  const client = new FakeXClient({
    pages: [
      {
        tweets: [
          statusWithId("keep-recent", tooRecent),
          statusWithId("delete-me", old),
          {
            ...statusWithId("keep-tag", old),
            entities: { hashtags: [{ tag: "keep" }] },
          },
        ],
      },
    ],
  });
  const setting: Setting = { ...baseSetting, keepTags: ["keep"] };

  const summary = await run({
    client,
    setting,
    now,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.deepEqual(client.deleteCalls, ["delete-me"]);
  assert.equal(summary.deletedCount, 1);
});

test("run: dry run logs candidates and deletes nothing", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old), statusWithId("2", old)] }],
  });
  const setting: Setting = { ...baseSetting, dryRun: true };
  const logs: string[] = [];

  const summary = await run({
    client,
    setting,
    logger: { log: (m) => logs.push(m) },
    sleep: noopSleep,
  });

  assert.equal(client.deleteCalls.length, 0);
  assert.equal(summary.deletedCount, 0);
  assert.equal(summary.dryRun, true);
  assert.ok(logs.some((l) => l.includes("2個のツイートが削除対象です")));
});

test("run: caps deletions at maxDeletes", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [
      {
        tweets: [
          statusWithId("1", old),
          statusWithId("2", old),
          statusWithId("3", old),
        ],
      },
    ],
  });
  const setting: Setting = { ...baseSetting, maxDeletes: 2 };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.equal(client.deleteCalls.length, 2);
  assert.equal(summary.deletedCount, 2);
  assert.equal(summary.skippedForCap, 1);
});

test("run: MAX_DELETES cap processes the oldest eligible posts first, not the newest", async () => {
  const oldest = new Date("2020-01-01T00:00:00.000Z");
  const middle = new Date("2020-01-02T00:00:00.000Z");
  const newest = new Date("2020-01-03T00:00:00.000Z");
  const client = new FakeXClient({
    // The API returns the timeline newest-first.
    pages: [
      {
        tweets: [
          statusWithId("newest", newest),
          statusWithId("middle", middle),
          statusWithId("oldest", oldest),
        ],
      },
    ],
  });
  const setting: Setting = { ...baseSetting, maxDeletes: 2 };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  // The oldest two are deleted; the newest is left for next time (it's the
  // furthest from aging out of LOOKBACK_DAYS).
  assert.deepEqual(client.deleteCalls, ["oldest", "middle"]);
  assert.equal(summary.deletedCount, 2);
  assert.equal(summary.skippedForCap, 1);
});

test("run: retries once after a 429, then succeeds", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const resetAt = new Date(Date.now() + 1000);
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old)] }],
    deleteResults: [{ status: "rate_limited", resetAt }, { status: "deleted" }],
  });
  const setting: Setting = { ...baseSetting };
  const sleeps: number[] = [];

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(client.deleteCalls.length, 2);
  assert.equal(summary.deletedCount, 1);
  assert.equal(summary.skippedForRateLimit, 0);
  assert.equal(sleeps.length, 1);
});

test("run: gives up and reports remaining when still rate limited after retry", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const resetAt = new Date(Date.now() + 1000);
  const client = new FakeXClient({
    pages: [
      {
        tweets: [statusWithId("1", old), statusWithId("2", old)],
      },
    ],
    deleteResults: [
      { status: "rate_limited", resetAt },
      { status: "rate_limited", resetAt },
    ],
  });
  const setting: Setting = { ...baseSetting };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.equal(summary.deletedCount, 0);
  assert.equal(summary.skippedForRateLimit, 2);
  assert.equal(client.deleteCalls.length, 2); // stopped before attempting tweet 2
});

test("run: gives up immediately when the rate limit reset is too far away", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const farResetAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old)] }],
    deleteResults: [{ status: "rate_limited", resetAt: farResetAt }],
  });
  const setting: Setting = { ...baseSetting };
  let slept = false;

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: async () => {
      slept = true;
    },
  });

  assert.equal(slept, false);
  assert.equal(summary.deletedCount, 0);
  assert.equal(summary.skippedForRateLimit, 1);
});

test("run: gives up immediately (no waiting) when a 429 has no reset time", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old)] }],
    deleteResults: [{ status: "rate_limited", resetAt: undefined }],
  });
  const setting: Setting = { ...baseSetting };
  let slept = false;

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: async () => {
      slept = true;
    },
  });

  assert.equal(slept, false);
  assert.equal(summary.deletedCount, 0);
  assert.equal(summary.skippedForRateLimit, 1);
  assert.equal(client.deleteCalls.length, 1); // no retry attempted
});

test("run: a non-404/429 delete failure is recorded, not thrown, and the run continues", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old), statusWithId("2", old)] }],
    deleteResults: [
      { status: "failed", error: new Error("boom") },
      { status: "deleted" },
    ],
  });
  const setting: Setting = { ...baseSetting };
  const logs: string[] = [];

  const summary = await run({
    client,
    setting,
    logger: { log: (m) => logs.push(m) },
    sleep: noopSleep,
  });

  // Both posts were attempted - the failure on "1" didn't stop "2".
  assert.deepEqual(client.deleteCalls, ["1", "2"]);
  assert.equal(summary.deletedCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.deepEqual(summary.failedIds, ["1"]);
  assert.ok(logs.some((l) => l.includes("[FAILED]") && l.includes("boom")));
});

test("run: failedIds is capped but failedCount reflects the true total", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const failureCount = 22;
  const tweets = Array.from({ length: failureCount }, (_, i) =>
    statusWithId(`fail-${i}`, old),
  );
  const client = new FakeXClient({
    pages: [{ tweets }],
    deleteResults: tweets.map(() => ({
      status: "failed" as const,
      error: new Error("boom"),
    })),
  });
  const setting: Setting = { ...baseSetting, maxDeletes: failureCount };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.equal(summary.failedCount, failureCount);
  assert.equal(summary.failedIds.length, 20);
});

test("run: a fetch error (e.g. GET /2/users/me) still throws", async () => {
  const client: XClient = {
    async getMyUserId(): Promise<string> {
      throw new Error("network down");
    },
    async fetchTweetsPage(): Promise<FetchTweetsPage> {
      throw new Error("unused");
    },
    async deleteTweet(): Promise<DeleteTweetResult> {
      throw new Error("unused");
    },
    async unretweet(): Promise<DeleteTweetResult> {
      throw new Error("unused");
    },
  };
  const setting: Setting = { ...baseSetting };

  await assert.rejects(() =>
    run({ client, setting, logger: noopLogger, sleep: noopSleep }),
  );
});

test("run: a 404 (already deleted) is skipped, not counted as deleted, and the run continues", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old), statusWithId("2", old)] }],
    deleteResults: [{ status: "already_deleted" }, { status: "deleted" }],
  });
  const setting: Setting = { ...baseSetting };
  const logs: string[] = [];

  const summary = await run({
    client,
    setting,
    logger: { log: (m) => logs.push(m) },
    sleep: noopSleep,
  });

  assert.deepEqual(client.deleteCalls, ["1", "2"]);
  assert.equal(summary.deletedCount, 1);
  assert.equal(summary.alreadyDeletedCount, 1);
  assert.equal(summary.skippedForRateLimit, 0);
  assert.ok(logs.some((l) => l.includes("ALREADY GONE")));
});

test("run: removes a Retweet via unretweet(userId, sourceId) instead of DELETE /2/tweets/:id", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [retweetOf("rt-1", "original-1", old)] }],
    userId: "me-id",
  });
  const setting: Setting = { ...baseSetting };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.equal(client.deleteCalls.length, 0);
  assert.deepEqual(client.unretweetCalls, [
    { userId: "me-id", sourceTweetId: "original-1" },
  ]);
  assert.equal(summary.deletedCount, 1);
});

test("run: keepTexts still matches a Retweet's 'RT @...' text and keeps it", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [retweetOf("rt-1", "original-1", old)] }],
  });
  const setting: Setting = { ...baseSetting, keepTexts: [/^RT @/] };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.equal(client.deleteCalls.length, 0);
  assert.equal(client.unretweetCalls.length, 0);
  assert.equal(summary.deletedCount, 0);
});

test("run: a 404 on unretweet is also treated as already-removed", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [retweetOf("rt-1", "original-1", old)] }],
    unretweetResults: [{ status: "already_deleted" }],
  });
  const setting: Setting = { ...baseSetting };

  const summary = await run({
    client,
    setting,
    logger: noopLogger,
    sleep: noopSleep,
  });

  assert.equal(summary.deletedCount, 0);
  assert.equal(summary.alreadyDeletedCount, 1);
});

test("run: warns when posts are skipped for the MAX_DELETES cap", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old), statusWithId("2", old)] }],
  });
  const setting: Setting = { ...baseSetting, maxDeletes: 1 };
  const logs: string[] = [];

  const summary = await run({
    client,
    setting,
    logger: { log: (m) => logs.push(m) },
    sleep: noopSleep,
  });

  assert.equal(summary.skippedForCap, 1);
  assert.ok(
    logs.some((l) => l.includes("[WARNING]") && l.includes("full_scan")),
  );
});

test("run: dry run also warns when posts would be skipped for the MAX_DELETES cap", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old), statusWithId("2", old)] }],
  });
  const setting: Setting = { ...baseSetting, maxDeletes: 1, dryRun: true };
  const logs: string[] = [];

  await run({
    client,
    setting,
    logger: { log: (m) => logs.push(m) },
    sleep: noopSleep,
  });

  assert.ok(
    logs.some((l) => l.includes("[WARNING]") && l.includes("full_scan")),
  );
});

test("run: no warning is logged when nothing is skipped", async () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  const client = new FakeXClient({
    pages: [{ tweets: [statusWithId("1", old)] }],
  });
  const setting: Setting = { ...baseSetting };
  const logs: string[] = [];

  await run({
    client,
    setting,
    logger: { log: (m) => logs.push(m) },
    sleep: noopSleep,
  });

  assert.ok(!logs.some((l) => l.includes("[WARNING]")));
});
