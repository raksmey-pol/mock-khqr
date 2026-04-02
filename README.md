# Mock Store Sandbox

This folder contains a simple end-to-end checkout sandbox:

- `mock-store-api/` (NestJS): mock merchant backend
- `mock-store-web/` (Next.js): mock merchant storefront

It is designed to test the flow:

1. Storefront requests checkout intent from mock merchant backend.
2. Mock merchant backend signs and calls Open Banking `POST /api/checkout/intents`.
3. Storefront displays KHQR and polls status.
4. Open Banking sends signed webhook updates to mock merchant backend.

## Prerequisites

- Node.js 20+
- Open Banking service running (default: `http://localhost:8080`)
- One merchant record in DB with:
  - `status = APPROVED`
  - valid KHQR profile configured
  - `api_signing_secret` configured (for request signing)
  - `webhook_signing_secret` configured (for webhook delivery signing)
  - `webhook_url` set to the mock API endpoint

## 1) Start Mock Merchant API (NestJS)

```bash
cd mock/mock-store-api
cp .env.example .env
npm install
npm run start:dev
```

Environment values in `.env`:

- `OPEN_BANKING_BASE_URL` (default: `http://localhost:8080`)
- `MERCHANT_ID` (UUID from your `merchants` table)
- `MERCHANT_API_SIGNING_SECRET` (same as merchant `api_signing_secret`)
- `MERCHANT_WEBHOOK_SIGNING_SECRET` (same as merchant `webhook_signing_secret`)
- `WEB_ORIGIN` (default: `http://localhost:3000`)

Note: runtime reads `mock-store-api/.env`. Updating only `.env.example` does not change the running service.

## 2) Ensure Merchant Webhook URL Points to Mock API

Set merchant `webhook_url` to:

- `http://localhost:4000/store/webhooks/payment-updates`

If Open Banking runs in Docker and cannot reach `localhost`, use your host-reachable address, for example:

- `http://host.docker.internal:4000/store/webhooks/payment-updates`

## 3) Start Mock Storefront (Next.js)

```bash
cd mock/mock-store-web
cp .env.local.example .env.local
npm install
npm run dev
```

Default storefront URL:

- `http://localhost:3000`

## 4) Test the Flow

1. Open `http://localhost:3000`.
2. Enter amount and order details.
3. Click **Create KHQR Intent**.
4. Scan displayed QR with Bakong app.
5. Observe status transitions and webhook events in the page.

## API Endpoints Exposed by Mock Merchant API

- `GET /store/health`
- `POST /store/checkout-intents`
- `GET /store/checkout-status/:checkoutToken`
- `POST /store/webhooks/payment-updates`
- `GET /store/webhooks/events`

## Deploy Mock API with Docker + Nginx + SSL

Use this when your storefront is on Vercel and only the mock API is self-hosted.

1. Prepare env file:

```bash
cd mock-khqr/mock-store-api
cp .env.example .env
```

Set these values in `.env`:

- `WEB_ORIGIN=https://<your-vercel-domain>`
- `OPEN_BANKING_BASE_URL=<your-open-banking-url>`
- `MERCHANT_ID`, `MERCHANT_API_SIGNING_SECRET`, `MERCHANT_WEBHOOK_SIGNING_SECRET`

2. Start the API container:

```bash
cd mock-khqr
docker compose -f docker-compose.mock-api.yml up -d --build
```

If your server does not support `docker compose` (v2 plugin), use:

```bash
cd mock-khqr
docker-compose -f docker-compose.mock-api.yml up -d --build
```

Or use the compatibility helper script (auto-detects both forms):

```bash
cd mock-khqr
bash scripts/deploy-mock-api.sh
```

3. Configure reverse proxy + SSL on the server:

```bash
sudo bash mock-khqr/scripts/setup-mock-api-domain.sh <api-domain> <email>
```

This script will:

- install Nginx + Certbot
- deploy `mock-khqr/nginx/mock-store-api.conf`
- request and install Let's Encrypt certificate
- configure automatic certificate renewal
