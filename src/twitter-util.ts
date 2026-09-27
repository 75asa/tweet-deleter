import Twit from "twit";
import type { Status } from "twitter-d";
import type { Setting } from "./settings.ts";

export default class TwitterUtil {
  #twitter: Twit;

  constructor(setting: Setting) {
    this.#twitter = new Twit({
      consumer_key: setting.consumerKey,
      consumer_secret: setting.consumerSecret,
      access_token: setting.accessToken,
      access_token_secret: setting.accessTokenSecret,
    });
  }

  async getAllTweets(): Promise<Status[]> {
    let tweets: Status[] = [];
    const payload: { [s: string]: string | number | boolean } = {
      count: 200,
      trim_user: true,
      tweet_mode: "extended",
    };
    for (;;) {
      const ret = await this.#twitter.get("statuses/user_timeline", payload);
      const statuses = ret.data as Status[];
      if (statuses.length === 0) {
        break;
      }
      payload.max_id = (
        BigInt(statuses[statuses.length - 1].id_str) - 1n
      ).toString();
      tweets = tweets.concat(statuses);
    }
    return tweets;
  }

  async tweet(text: string): Promise<void> {
    const payload = {
      status: text,
    };
    await this.#twitter.post("statuses/update", payload);
  }

  async destroy(id: string): Promise<void> {
    const payload = {
      id,
    };
    await this.#twitter.post("statuses/destroy/:id", payload);
  }
}
