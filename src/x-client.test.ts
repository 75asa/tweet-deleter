import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiResponseError, type TwitterApi } from "twitter-api-v2";
import type { Setting } from "./settings.ts";
import { TwitterApiV2XClient } from "./x-client.ts";

const baseSetting: Setting = {
  consumerKey: "k",
  consumerSecret: "s",
  accessToken: "t",
  accessTokenSecret: "ts",
  keepTags: [],
  exceptionIds: [],
  keepTexts: [],
  lookbackDays: 7,
  maxDeletes: 50,
  fullScan: false,
  dryRun: false,
};

// A fake, network-free stand-in for the real `TwitterApi` client. Only the
// methods TwitterApiV2XClient actually calls are implemented; the rest of
// the real client's (very large) surface isn't needed here.
const fakeApiClient = (overrides: {
  deleteTweet?: (id: string) => Promise<unknown>;
  unretweet?: (userId: string, sourceTweetId: string) => Promise<unknown>;
}): TwitterApi =>
  ({
    v2: {
      deleteTweet:
        overrides.deleteTweet ?? (async () => ({ data: { deleted: true } })),
      unretweet:
        overrides.unretweet ?? (async () => ({ data: { retweeted: false } })),
    },
  }) as unknown as TwitterApi;

const rateLimitError = (rateLimit?: {
  limit: number;
  remaining: number;
  reset: number;
}) =>
  new ApiResponseError("rate limited", {
    code: 429,
    // biome-ignore lint/suspicious/noExplicitAny: fake request/response, only `code`/`rateLimit` matter here
    request: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: fake request/response, only `code`/`rateLimit` matter here
    response: {} as any,
    headers: {},
    data: {},
    rateLimit,
  });

const notFoundError = () =>
  new ApiResponseError("not found", {
    code: 404,
    // biome-ignore lint/suspicious/noExplicitAny: fake request/response, only `code` matters here
    request: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: fake request/response, only `code` matters here
    response: {} as any,
    headers: {},
    data: {},
  });

test("deleteTweet: deleted: true succeeds", async () => {
  const client = new TwitterApiV2XClient(baseSetting, fakeApiClient({}));
  assert.deepEqual(await client.deleteTweet("1"), { status: "deleted" });
});

test("deleteTweet: deleted: false is a failure, not counted as deleted", async () => {
  const client = new TwitterApiV2XClient(
    baseSetting,
    fakeApiClient({ deleteTweet: async () => ({ data: { deleted: false } }) }),
  );
  const result = await client.deleteTweet("1");
  assert.equal(result.status, "failed");
});

test("unretweet: retweeted: false succeeds", async () => {
  const client = new TwitterApiV2XClient(baseSetting, fakeApiClient({}));
  assert.deepEqual(await client.unretweet("u1", "s1"), { status: "deleted" });
});

test("unretweet: retweeted: true (still retweeted) is a failure, not counted as deleted", async () => {
  const client = new TwitterApiV2XClient(
    baseSetting,
    fakeApiClient({
      unretweet: async () => ({ data: { retweeted: true } }),
    }),
  );
  const result = await client.unretweet("u1", "s1");
  assert.equal(result.status, "failed");
});

test("deleteTweet: 404 is already_deleted", async () => {
  const client = new TwitterApiV2XClient(
    baseSetting,
    fakeApiClient({
      deleteTweet: async () => {
        throw notFoundError();
      },
    }),
  );
  assert.deepEqual(await client.deleteTweet("1"), {
    status: "already_deleted",
  });
});

test("deleteTweet: 429 with rate-limit headers is rate_limited with resetAt", async () => {
  const resetEpochSeconds = Math.floor(Date.now() / 1000) + 60;
  const client = new TwitterApiV2XClient(
    baseSetting,
    fakeApiClient({
      deleteTweet: async () => {
        throw rateLimitError({
          limit: 50,
          remaining: 0,
          reset: resetEpochSeconds,
        });
      },
    }),
  );
  const result = await client.deleteTweet("1");
  assert.equal(result.status, "rate_limited");
  assert.equal(
    result.status === "rate_limited" ? result.resetAt?.getTime() : undefined,
    resetEpochSeconds * 1000,
  );
});

test("deleteTweet: 429 without rate-limit headers is still rate_limited, with resetAt undefined", async () => {
  const client = new TwitterApiV2XClient(
    baseSetting,
    fakeApiClient({
      deleteTweet: async () => {
        throw rateLimitError(undefined);
      },
    }),
  );
  const result = await client.deleteTweet("1");
  assert.deepEqual(result, { status: "rate_limited", resetAt: undefined });
});

test("deleteTweet: an unrelated error is a failure", async () => {
  const client = new TwitterApiV2XClient(
    baseSetting,
    fakeApiClient({
      deleteTweet: async () => {
        throw new Error("network blip");
      },
    }),
  );
  const result = await client.deleteTweet("1");
  assert.equal(result.status, "failed");
});
