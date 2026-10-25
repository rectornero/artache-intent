# Artache Intent Writer

## Netlify credits (all sites share one balance)

Every site in the overgame-director Netlify team (laventina, artache, novaula, ai-ice, tzero) draws on one credit balance: 1,000 credits a month on the Personal plan, plus packs. When it reaches zero, every site is paused. On 2026-10-25 a single every-minute job that woke a database burned almost a whole month. These rules keep that from happening again.

- No scheduled job or polling loop touches the database on every run. Gate it on a cheap check (for example a Blobs note of when there is next work), or use delayed or event-driven scheduling instead of polling.
- Client polling is never faster than 60 seconds.
- No Netlify AI Gateway unless Nero approves it.
- Test on branches: Deploy Previews and branch deploys are free. Batch changes into as few production deploys as possible, and ask Nero before deploying while credits are low.
- Before adding any schedule, polling or production deploy, estimate its monthly credits and say the number.

Prices: production deploy 15 credits; compute and database compute 10 per GB-hour; bandwidth 20 per GB; web requests 2 per 10,000; AI Gateway 180 per USD. The Neon database suspends after about 5 idle minutes, so anything that calls it more often than that keeps it awake.

### In this repo

- Intent Writer isn't hosted on Netlify. Pushes to `main` run the GitHub Actions release build, so ask Nero before every push to main.
- Claude is called directly at api.anthropic.com with the writer's own key, never through Netlify AI Gateway.
- Sync through the Artache account (when it is built) is event-driven: on open, on window focus and after a pause in typing, with at least 60 seconds between uploads and nothing sent when nothing changed. No timers that call the server and no server-side schedule.
- Local timers (such as backups) are fine as long as they never touch the network.
