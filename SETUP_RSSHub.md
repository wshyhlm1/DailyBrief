# Setup RSSHub for DailyBrief (Serenity X Feed Fix)

This setup switches DailyBrief's X/Twitter feed source(s) from `rsshub.app` to your local RSSHub instance so feeds that require auth can work reliably.

## 1) Extract `auth_token` from X (Twitter)

1. Open [https://x.com](https://x.com) and sign in with the account you want RSSHub to use.
2. Press `F12` to open DevTools.
3. Go to `Application` (Chrome/Edge) or `Storage` (Firefox).
4. Open `Cookies` -> `https://x.com`.
5. Find cookie key `auth_token` and copy its `Value`.

Keep this token private. Do not commit it to git.

## 2) Set `TWITTER_AUTH_TOKEN` in `.env`

If you do not already have a `.env` file:

```bash
cp .env.example .env
```

Then edit `.env` and set:

```bash
TWITTER_AUTH_TOKEN=PASTE_YOUR_AUTH_TOKEN_HERE
```

## 3) Start RSSHub with Docker

From the project root:

```bash
docker compose up -d
```

RSSHub should now be reachable at `http://localhost:1200`.

## 4) GitHub Actions secret

The DailyBrief workflow starts an RSSHub service container and points the
`x-serenity` source at `http://localhost:1200/twitter/user/aleabitoreddit`.
For the hosted run to work, add the same token as an Actions secret:

```bash
gh secret set TWITTER_AUTH_TOKEN --body "$TWITTER_AUTH_TOKEN" --repo wshyhlm1/DailyBrief
```

## 5) Verify Serenity feed (critical check)

Run:

```bash
curl http://localhost:1200/twitter/user/aleabitoreddit
```

You should get RSS/XML output (not `404`).

If your RSSHub build expects the newer X route, test:

```bash
curl http://localhost:1200/x/user/aleabitoreddit
```
