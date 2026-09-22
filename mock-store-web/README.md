# mock-store-web

Next.js mock store app for KHQR checkout flow testing.

It serves both:

- the storefront UI (`/`, `/khqr-demo`), and
- the mock merchant API (Route Handlers under `app/store/*`) that signs checkout requests and verifies webhooks.

## Run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set the Open Banking values in `.env.local` (`OPEN_BANKING_BASE_URL`, `MERCHANT_ID`, signing secrets). Default URLs:

- Storefront: `http://localhost:3003`
- API (same origin): `http://localhost:3003/store/health`

## API routes

| Method | Endpoint                                | Purpose                                             |
| ------ | --------------------------------------- | --------------------------------------------------- |
| `GET`  | `/store/health`                         | Health check                                        |
| `POST` | `/store/checkout-intents`               | Create checkout intent through signed upstream call |
| `GET`  | `/store/checkout-status/:checkoutToken` | Proxy checkout status lookup                        |
| `POST` | `/store/webhooks/payment-updates`       | Receive and verify signed webhook from Open Banking |
| `GET`  | `/store/webhooks/events`                | Inspect in-memory webhook inbox                     |

Implementation:

- `app/store/**/route.ts` — route handlers (HTTP layer)
- `server/` — signing, validation, and webhook store logic

## Vercel Environment Variables

For Vercel deployment, set the server config (Open Banking URL, merchant id, signing secrets) in Project Settings -> Environment Variables.

Only set `NEXT_PUBLIC_STORE_API_BASE_URL` if the browser must call a separately hosted API:

- `NEXT_PUBLIC_STORE_API_BASE_URL=https://mock-api.example.com`

## What You Can Test

- Create checkout intent through mock merchant backend.
- Display KHQR payload as scannable QR.
- Poll checkout status by checkout token.
- Observe signed webhook deliveries received by merchant backend.
