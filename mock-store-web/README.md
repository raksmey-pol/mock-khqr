# mock-store-web

Next.js mock storefront UI for KHQR checkout flow testing.

## Run

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Required env var in `.env.local`:

- `NEXT_PUBLIC_STORE_API_BASE_URL=http://localhost:4000`

## Vercel Environment Variables

For Vercel deployment, set this variable in Project Settings -> Environment Variables:

- `NEXT_PUBLIC_STORE_API_BASE_URL=https://<your-api-domain>`

Example:

- `NEXT_PUBLIC_STORE_API_BASE_URL=https://mock-api.example.com`

## What You Can Test

- Create checkout intent through mock merchant backend.
- Display KHQR payload as scannable QR.
- Poll checkout status by checkout token.
- Observe signed webhook deliveries received by merchant backend.
