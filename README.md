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

## Usage (GitHub Actions)

1. fork
2. Set `Secrets` on Repository ( CONSUMER_KEY / CONSUMER_SECRET / ACCESS_TOKEN / ACCESS_TOKEN_SECRET )
3. Enable the `delete-tweets` workflow on the Actions tab (scheduled workflows are disabled on forks by default)
4. Automatically run at 0 o'clock Japan time ( GMT+09:00 )

You can also run it manually from the Actions tab with `dry_run` enabled.

## Development

```bash
$ npm run check     # lint and format (Biome)
$ npm run typecheck
$ npm test
```

## License

MIT &copy; takanakahiko
