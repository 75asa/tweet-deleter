import { ApiResponseError, TwitterApi } from "twitter-api-v2";
import type { Status } from "./index.ts";
import type { Setting } from "./settings.ts";

export interface FetchTweetsParams {
  userId: string;
  /** ISO 8601. Omitted for a full scan. */
  startTime?: string;
  /** ISO 8601. */
  endTime: string;
  paginationToken?: string;
}

export interface FetchTweetsPage {
  tweets: Status[];
  nextToken?: string;
}

export type DeleteTweetResult =
  | { status: "deleted" }
  // The post (or, for unretweet, the retweet relationship) was already gone
  // by the time we tried to remove it (HTTP 404). Not an error: something
  // else (a manual delete, a previous partial run, ...) got there first.
  | { status: "already_deleted" }
  | { status: "rate_limited"; resetAt: Date }
  | { status: "failed"; error: unknown };

/**
 * Injectable X API v2 client. Tests provide a fake implementation instead of
 * hitting the network.
 */
export interface XClient {
  /** `GET /2/users/me` */
  getMyUserId(): Promise<string>;
  /** `GET /2/users/:id/tweets` (one page). */
  fetchTweetsPage(params: FetchTweetsParams): Promise<FetchTweetsPage>;
  /** `DELETE /2/tweets/:id` */
  deleteTweet(id: string): Promise<DeleteTweetResult>;
  /**
   * `DELETE /2/users/:id/retweets/:source_tweet_id` - removes the Retweet
   * relationship rather than deleting a post. Used instead of `deleteTweet`
   * for posts that are Retweets (see the `referenced_tweets` check in
   * index.ts): docs.x.com doesn't document what `DELETE /2/tweets/:id` does
   * to a Retweet's own id, so we use the endpoint that's documented to be
   * the right one for undoing a Retweet.
   */
  unretweet(userId: string, sourceTweetId: string): Promise<DeleteTweetResult>;
}

interface UserTweetsResponse {
  data?: Status[];
  meta?: { next_token?: string };
}

const toDeleteTweetResult = (error: unknown): DeleteTweetResult => {
  if (error instanceof ApiResponseError) {
    if (error.code === 404) {
      return { status: "already_deleted" };
    }
    if (error.code === 429 && error.rateLimit) {
      return {
        status: "rate_limited",
        resetAt: new Date(error.rateLimit.reset * 1000),
      };
    }
  }
  return { status: "failed", error };
};

export class TwitterApiV2XClient implements XClient {
  #client: TwitterApi;

  constructor(setting: Setting) {
    this.#client = new TwitterApi({
      appKey: setting.consumerKey,
      appSecret: setting.consumerSecret,
      accessToken: setting.accessToken,
      accessSecret: setting.accessTokenSecret,
    });
  }

  async getMyUserId(): Promise<string> {
    const me = await this.#client.v2.me();
    return me.data.id;
  }

  async fetchTweetsPage(params: FetchTweetsParams): Promise<FetchTweetsPage> {
    const query: Record<string, string | number> = {
      max_results: 100,
      "tweet.fields": "created_at,entities,referenced_tweets",
      end_time: params.endTime,
    };
    if (params.startTime) query.start_time = params.startTime;
    if (params.paginationToken) query.pagination_token = params.paginationToken;

    const res = await this.#client.v2.get<UserTweetsResponse>(
      `users/${params.userId}/tweets`,
      query,
    );
    return {
      tweets: res.data ?? [],
      nextToken: res.meta?.next_token,
    };
  }

  async deleteTweet(id: string): Promise<DeleteTweetResult> {
    try {
      await this.#client.v2.deleteTweet(id);
      return { status: "deleted" };
    } catch (error) {
      return toDeleteTweetResult(error);
    }
  }

  async unretweet(
    userId: string,
    sourceTweetId: string,
  ): Promise<DeleteTweetResult> {
    try {
      await this.#client.v2.unretweet(userId, sourceTweetId);
      return { status: "deleted" };
    } catch (error) {
      return toDeleteTweetResult(error);
    }
  }
}
