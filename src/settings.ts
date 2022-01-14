import { loadEnv } from "./dotenv";
export interface Setting {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  keepTags: string[];
  exceptionIds: string[];
  keepTexts: RegExp[];
}

export function settings(): Setting {
  loadEnv();
  return {
    consumerKey: process.env.CONSUMER_KEY || "",
    consumerSecret: process.env.CONSUMER_SECRET || "",
    accessToken: process.env.ACCESS_TOKEN || "",
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "",
    keepTags: ["Zenn", "keep", "朝活", "Nonion"],
    exceptionIds: [
      "1424563468443602945",
      "1424563468443602945",
      "1467150465758806019",
    ],
    keepTexts: [
      /Slack/,
      /Bolt/,
      /Notion/,
      /海砂利水魚/,
      /TS/,
      /Rust/,
      /Deno/,
      /Golang/,
      /go/,
      /マイニュー/,
      /my new/,
      /gear/,
    ],
  };
}
