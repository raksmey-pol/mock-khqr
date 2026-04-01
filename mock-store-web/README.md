# mock-store-web

Next.js mock storefront UI for KHQR checkout flow testing.

## Run

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

## What You Can Test

- Create checkout intent through mock merchant backend.
- Display KHQR payload as scannable QR.
- Poll checkout status by checkout token.
- Observe signed webhook deliveries received by merchant backend.
