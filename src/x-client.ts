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
}

interface UserTweetsResponse {
  data?: Status[];
  meta?: { next_token?: string };
}

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
      "tweet.fields": "created_at,entities",
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
      if (
        error instanceof ApiResponseError &&
        error.code === 429 &&
        error.rateLimit
      ) {
        return {
          status: "rate_limited",
          resetAt: new Date(error.rateLimit.reset * 1000),
        };
      }
      return { status: "failed", error };
    }
  }
}
