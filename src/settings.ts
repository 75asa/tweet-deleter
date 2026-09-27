export interface Setting {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  keepTags: string[];
  exceptionIds: string[];
  keepTexts: RegExp[];
  /** Own user id. When set (`X_USER_ID`), skips the `GET /2/users/me` call. */
  userId?: string;
  /** How many days before the deletion boundary to start fetching from. */
  lookbackDays: number;
  /** Upper bound on how many tweets are deleted in a single run. */
  maxDeletes: number;
  /** Skip the `start_time` window and fetch the full available history. */
  fullScan: boolean;
  /** Log what would be deleted instead of actually deleting. */
  dryRun: boolean;
}

// X API v2 delete (OAuth 1.0a user context) is informally rate-limited to
// roughly 50 requests / 15 minutes. Defaulting to 50 keeps a single daily run
// inside one rate-limit window, and caps the worst-case per-run cost at
// 50 * $0.010 = $0.50 (see docs.x.com/x-api/getting-started/pricing).
const DEFAULT_MAX_DELETES = 50;

// A week of headroom in case a run is skipped (e.g. Actions outage): posts
// created in that window are still picked up on the next successful run.
const DEFAULT_LOOKBACK_DAYS = 7;

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function settings(): Setting {
  return {
    consumerKey: process.env.CONSUMER_KEY || "",
    consumerSecret: process.env.CONSUMER_SECRET || "",
    accessToken: process.env.ACCESS_TOKEN || "",
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "",
    keepTags: ["Zenn", "keep", "朝活", "Notion"],
    exceptionIds: ["1424563468443602945", "1541631952389668865"],
    keepTexts: [
      /Slack/,
      /Bolt/,
      /Notion/,
      /Zenn/,
      /TS/,
      /TypeScript/,
      /Rust/,
      /Deno/,
      /Golang/,
      /マイニュー/,
      /my new/,
      /gear/,
    ],
    userId: process.env.X_USER_ID || undefined,
    lookbackDays: parsePositiveInt(
      process.env.LOOKBACK_DAYS,
      DEFAULT_LOOKBACK_DAYS,
    ),
    maxDeletes: parsePositiveInt(process.env.MAX_DELETES, DEFAULT_MAX_DELETES),
    fullScan: Boolean(process.env.FULL_SCAN),
    dryRun: Boolean(process.env.DRY_RUN),
  };
}
