# AntiVirusWebsite

Next.js dashboard for AV research simulation events. Deploy on **Vercel** — **no environment variables required**.

The API URL is baked in: `https://antivirusapi-production.up.railway.app`

## Vercel deploy

1. Push to GitHub (`pgyb41494-create/AntiVirusWebsite`)
2. [Vercel](https://vercel.com) → **Import** → select repo → **Deploy**

That's it. No env vars to configure.

## Optional override

If your Railway API URL changes, set in Vercel:

- `NEXT_PUBLIC_API_URL` — custom API URL

## Architecture

```
Simulator (local VM) → AntiVirusAPI (Railway) ← AntiVirusWebsite (Vercel)
                              ↑
                       AntiVirusBot (Railway)
```

## Secrets stay on Railway

| Service | Env vars needed |
|---------|-----------------|
| **AntiVirusAPI** | `SIMULATOR_API_KEY`, `BOT_API_KEY`, `DATABASE_URL` (auto) |
| **AntiVirusBot** | `DISCORD_TOKEN`, `API_URL`, `BOT_API_KEY` |
| **AntiVirusWebsite** | None |
| **Simulator** (local) | `API_URL`, `SIMULATOR_API_KEY` |
