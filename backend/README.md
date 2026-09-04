# Auxweave backend

Lean Elysia API backing the Auxweave submission demo: CORS-safe image proxy,
Unsplash search, and Paystack sponsor checkout. No database, no auth — the
editor persists documents locally in the browser.

## Routes

- `GET /health`
- `GET /media/proxy?url=...`
- `GET /unsplash/photos`, `GET /unsplash/search`, `GET /unsplash/download`
- `GET /sponsor/config`
- `POST /sponsor/checkout`
- `GET /sponsor/verify/:reference`

## Setup

1. Copy `.env.example` to `.env` (only `UNSPLASH_ACCESS_KEY` / `PAYSTACK_*` are optional)
2. Install dependencies with `bun install`
3. Start the API with `bun run dev`
