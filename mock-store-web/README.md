# mock-store-web

Next.js mock store app for KHQR checkout flow testing.

It serves both:

- the storefront UI (`/`, `/khqr-demo`), and
- the mock merchant API (Route Handlers under `app/store/*`) that generates Bakong KHQR payloads locally and tracks payment status from signed webhooks.

## Run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set the Bakong values in `.env.local` (`BAKONG_ACCOUNT_ID`, and optionally `MERCHANT_NAME`, `MERCHANT_CITY`, `MERCHANT_WEBHOOK_SIGNING_SECRET`). Default URLs:

- Storefront: `http://localhost:3003`
- API (same origin): `http://localhost:3003/store/health`

## API routes

| Method | Endpoint                                | Purpose                                        |
| ------ | --------------------------------------- | ---------------------------------------------- |
| `GET`  | `/store/health`                         | Health check                                   |
| `POST` | `/store/checkout-intents`               | Generate a Bakong KHQR intent locally          |
| `GET`  | `/store/checkout-status/:checkoutToken` | Read locally tracked checkout status           |
| `POST` | `/store/webhooks/payment-updates`       | Verify signed webhook and update intent status |
| `GET`  | `/store/webhooks/events`                | Inspect in-memory webhook inbox                |

Implementation:

- `app/store/**/route.ts` — route handlers (HTTP layer)
- `server/` — KHQR generation, intent store, validation, and webhook store logic
- `types/` — type declarations for the `bakong-khqr` SDK

## Vercel Environment Variables

For Vercel deployment, set the server config in Project Settings -> Environment Variables:

- `BAKONG_ACCOUNT_ID`
- `MERCHANT_NAME`, `MERCHANT_CITY` (optional)
- `MERCHANT_WEBHOOK_SIGNING_SECRET`

Only set `NEXT_PUBLIC_STORE_API_BASE_URL` if the browser must call a separately hosted API:

- `NEXT_PUBLIC_STORE_API_BASE_URL=https://mock-api.example.com`

## What You Can Test

- Create a checkout intent and render the generated KHQR.
- Scan the QR with a KHQR-compatible app.
- Deliver signed webhooks to update checkout status.
- Observe webhook deliveries in the inbox panel.
