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

// An unset/empty value falls back to `fallback`, but any other value that
// isn't a positive integer is a misconfiguration and must fail loudly rather
// than silently keep the default (e.g. `MAX_DELETES=0` should not quietly
// mean "use the default of 50").
const parsePositiveInt = (
  envName: string,
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value.trim()) || Number.parseInt(value, 10) <= 0) {
    throw new Error(
      `Invalid ${envName}: "${value}" (expected a positive integer)`,
    );
  }
  return Number.parseInt(value, 10);
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
      "LOOKBACK_DAYS",
      process.env.LOOKBACK_DAYS,
      DEFAULT_LOOKBACK_DAYS,
    ),
    maxDeletes: parsePositiveInt(
      "MAX_DELETES",
      process.env.MAX_DELETES,
      DEFAULT_MAX_DELETES,
    ),
    fullScan: Boolean(process.env.FULL_SCAN),
    dryRun: Boolean(process.env.DRY_RUN),
  };
}
