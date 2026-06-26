# AntiVirusWebsite

Next.js dashboard for AV research simulation events. Deploy on **Vercel**.

## Vercel deploy

1. Push to GitHub (`pgyb41494-create/AntiVirusWebsite`)
2. [Vercel](https://vercel.com) → **Import** → select repo
3. Set environment variables:
   - `NEXT_PUBLIC_API_URL` — your Railway API URL
   - `API_URL` — same Railway API URL (server-side, for clear button)
   - `SIMULATOR_API_KEY` — same secret as Railway API (for clear button)
4. Deploy

## Local dev

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000

## Architecture

```
Simulator (local VM) → AntiVirusAPI (Railway) ← AntiVirusWebsite (Vercel)
                              ↑
                       AntiVirusBot (Railway)
```
