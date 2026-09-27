# tweet-deleter

## Whats this?

Delete your 2 or more days ago tweets Automatically.

> [!WARNING]
> The X API is pay-per-use and has no free tier.
> Buy credits and set a spending limit in the [X Developer Console](https://console.x.com/) before running this.
> See [X API pricing](https://docs.x.com/x-api/getting-started/pricing) for details.

## Requirements

- Node.js 24.2 or later
- An X Developer app with Read and Write permission

## Usage (local)

fork and clone and ...

```bash
$ cp _env .env
```

and fill in `CONSUMER_KEY` / `CONSUMER_SECRET` / `ACCESS_TOKEN` / `ACCESS_TOKEN_SECRET`, then

```bash
$ npm ci
$ DRY_RUN=1 npm run start # only log the tweets to delete
$ npm run start
```

### Environment variables

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `CONSUMER_KEY` / `CONSUMER_SECRET` / `ACCESS_TOKEN` / `ACCESS_TOKEN_SECRET` | yes | - | OAuth 1.0a user context credentials from the X Developer Console |
| `X_USER_ID` | no | - | Your numeric X user id. When set, skips the `GET /2/users/me` call |
| `LOOKBACK_DAYS` | no | `7` | How many days before the deletion boundary (yesterday 0:00 JST) to fetch posts from |
| `FULL_SCAN` | no | unset | When truthy, omits `start_time` and fetches the full available history (up to the last 3200 posts) instead of just the lookback window. Use for a one-off catch-up run |
| `MAX_DELETES` | no | `50` | Upper bound on how many posts are deleted in a single run |
| `DRY_RUN` | no | unset | When truthy, logs the posts that would be deleted instead of deleting them |

## Usage (GitHub Actions)

1. fork
2. Set `Secrets` on Repository ( CONSUMER_KEY / CONSUMER_SECRET / ACCESS_TOKEN / ACCESS_TOKEN_SECRET )
3. Optionally set repository `Variables` ( X_USER_ID / LOOKBACK_DAYS / MAX_DELETES ) to override the defaults above
4. Enable the `delete-tweets` workflow on the Actions tab (scheduled workflows are disabled on forks by default)
5. Automatically run at 0 o'clock Japan time ( GMT+09:00 )

You can also run it manually from the Actions tab with `dry_run` and/or `full_scan` enabled. A run's fetch/delete counts and estimated cost are written to the job summary; the bot no longer posts a completion or error tweet (errors instead fail the workflow run).

## Development

```bash
$ npm run check     # lint and format (Biome)
$ npm run typecheck
$ npm test
```

## License

MIT &copy; takanakahiko
