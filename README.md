<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/hero-light.svg">
  <img alt="post-deleter" src="docs/assets/hero-light.svg">
</picture>

# post-deleter

[![CI](https://github.com/75asa/post-deleter/actions/workflows/ci.yml/badge.svg)](https://github.com/75asa/post-deleter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Automatically delete your old posts on X.

> [!WARNING]
> The X API is pay-per-use and has no free tier.
> Buy credits and set a spending limit in the [X Developer Console](https://console.x.com/) before running this.
> See [X API pricing](https://docs.x.com/x-api/getting-started/pricing) for details.

## How it works

1. A scheduled GitHub Actions workflow runs daily at 0:00 JST.
2. It fetches your recent posts through the X API v2 (only the `LOOKBACK_DAYS` window, to keep read costs low).
3. It deletes the ones older than the deletion boundary, skipping posts that match your keep rules. Retweets are un-retweeted.
4. Counts and the estimated API cost are written to the job summary. It doesn't post anything to X.

## Requirements

- Node.js 24.2 or later
- An X Developer app with Read and Write permission

## Usage (GitHub Actions)

1. Fork this repository.
2. Set `Secrets` on the repository (`CONSUMER_KEY` / `CONSUMER_SECRET` / `ACCESS_TOKEN` / `ACCESS_TOKEN_SECRET`).
3. Optionally set repository `Variables` (`X_USER_ID` / `LOOKBACK_DAYS` / `MAX_DELETES`) to override the defaults (see [Environment variables](#environment-variables)).
4. Enable the `delete-tweets` workflow on the Actions tab (scheduled workflows are disabled on forks by default).
5. It runs automatically at 0 o'clock Japan time (GMT+09:00).

You can also run it manually from the Actions tab with `dry_run` and/or `full_scan` enabled. Errors fail the workflow run.

> [!TIP]
> On first use, or after a long pause, run the workflow manually once with `full_scan` enabled to catch up (with `dry_run` first to check what would be deleted). Posts older than the `LOOKBACK_DAYS` window, or ones skipped by `MAX_DELETES` / rate limiting, are not picked up by the daily run.

## Usage (local)

Fork and clone, then:

```bash
$ cp _env .env
```

Fill in `CONSUMER_KEY` / `CONSUMER_SECRET` / `ACCESS_TOKEN` / `ACCESS_TOKEN_SECRET`, then:

```bash
$ npm ci
$ DRY_RUN=1 npm run start # only log the posts to delete
$ npm run start
```

## Configuration

### Keep rules

Which posts to keep is defined in [`keep-rules.json`](./keep-rules.json) at the repo root, not in code:

```json
{
  "keepTags": ["Zenn", "keep"],
  "exceptionIds": ["1234567890123456789"],
  "keepTexts": ["Zenn", "TypeScript"]
}
```

- `keepTags`: hashtags to keep
- `exceptionIds`: post IDs to always keep
- `keepTexts`: regular expressions (as strings) matched against the post text

All three fields are required (use `[]` for none). The run fails if the file is missing or invalid, so nothing is deleted by mistake.

To keep another post, just edit this file (you can do it from the GitHub web UI).

### Environment variables

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `CONSUMER_KEY` / `CONSUMER_SECRET` / `ACCESS_TOKEN` / `ACCESS_TOKEN_SECRET` | yes | - | OAuth 1.0a user context credentials from the X Developer Console |
| `X_USER_ID` | no | - | Your numeric X user id. When set, skips the `GET /2/users/me` call |
| `LOOKBACK_DAYS` | no | `7` | How many days before the deletion boundary to fetch posts from |
| `FULL_SCAN` | no | unset | When set, fetches the full available history (up to the last 3200 posts) instead of just the lookback window. Use for a one-off catch-up run |
| `MAX_DELETES` | no | `50` | Upper bound on how many posts are deleted in a single run |
| `DRY_RUN` | no | unset | When set, only logs the posts that would be deleted |
| `KEEP_RULES_PATH` | no | `keep-rules.json` | Path to the keep rules file |

`LOOKBACK_DAYS` and `MAX_DELETES` must be positive integers; any other value fails the run.

## Development

```bash
$ npm run check     # lint and format (Biome)
$ npm run typecheck
$ npm test
```

## Credits

Forked from [takanakahiko/tweet-deleter](https://github.com/takanakahiko/tweet-deleter), created by [@takanakahiko](https://github.com/takanakahiko). Thank you for the original work!

## License

MIT &copy; takanakahiko, 75asa
