# External Fallback Trigger for DailyBrief

When GitHub `schedule` is delayed or dropped, you can trigger DailyBrief from an external cron service (for example, cron-job.org) via GitHub `repository_dispatch`.

## 1) Generate a GitHub PAT

Create a personal access token that can call repository dispatch APIs:

- Fine-grained PAT: repository `Actions: write` + `Contents: read` permissions
- Classic PAT: `repo` scope

Keep the token private.

## 2) Configure external cron

Create an external cron task around your target time (for example, every day 08:12 Asia/Shanghai) and call:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR_PAT>" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{"event_type":"daily-brief-fallback"}'
```

Example for this repo:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR_PAT>" \
  https://api.github.com/repos/wshyhlm1/DailyBrief/dispatches \
  -d '{"event_type":"daily-brief-fallback"}'
```

## 3) Duplicate-run safety

`daily.yml` now handles this event and checks whether today's report already exists on `gh-pages`.

- If today's report is missing: it builds.
- If today's report already exists: it skips.
