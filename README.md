# Mock KHQR Integration Sandbox

End-to-end merchant checkout sandbox for testing KHQR flow against the Open Banking backend.

It includes:

- `mock-store-api/` (NestJS): mock merchant backend that signs checkout requests and verifies webhooks.
- `mock-store-web/` (Next.js): mock storefront UI that creates intents, renders KHQR, and polls status.

## Table of contents

- [Overview](#overview)
- [Flow](#flow)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Configuration reference](#configuration-reference)
- [API reference (mock-store-api)](#api-reference-mock-store-api)
- [Docker deployment (mock API only)](#docker-deployment-mock-api-only)
- [Domain + SSL setup](#domain--ssl-setup)
- [Integration tips](#integration-tips)
- [Troubleshooting](#troubleshooting)
- [Related resources](#related-resources)

## Overview

This sandbox is intended for merchants and integrators who want to validate the full checkout lifecycle:

1. Storefront creates an intent through the mock merchant backend.
2. Mock merchant backend signs and forwards to Open Banking `POST /api/checkout/intents`.
3. Storefront shows KHQR and polls checkout status.
4. Open Banking sends signed webhook updates to the mock merchant backend.

## Flow

```text
Mock Storefront (Next.js)
  -> POST /store/checkout-intents

Mock Merchant API (NestJS)
  -> signed POST /api/checkout/intents (Open Banking)
  <- qrPayload + checkoutToken

Mock Storefront
  -> GET /store/checkout-status/:checkoutToken

Open Banking
  -> POST /store/webhooks/payment-updates (signed webhook)
```

## Project structure

```text
mock-khqr/
├── mock-store-api/
│   ├── src/
│   ├── .env.example
│   └── Dockerfile
├── mock-store-web/
│   ├── app/
│   └── .env.local.example
├── docker-compose.mock-api.yml
├── nginx/mock-store-api.conf
└── scripts/
    ├── deploy-mock-api.sh
    └── setup-mock-api-domain.sh
```

## Prerequisites

- Node.js 20+
- npm
- Open Banking backend running and reachable
- One approved merchant in Open Banking DB with:
  - `status = APPROVED`
  - KHQR profile configured
  - `api_signing_secret` configured
  - `webhook_signing_secret` configured
  - `webhook_url` configured for this mock API

## Quick start (local)

Run all commands from this directory (`mock-khqr/`).

### 1) Configure and start mock merchant API

```bash
cd mock-store-api
cp .env.example .env
npm install
npm run start:dev
```

By default, mock API runs on:

- `http://localhost:4000`

### 2) Set merchant webhook URL in Open Banking

Set merchant `webhook_url` to:

- `http://localhost:4000/store/webhooks/payment-updates`

If Open Banking runs in Docker and cannot reach host localhost, use a host-reachable endpoint (for example `host.docker.internal` where supported).

### 3) Configure and start mock storefront

```bash
cd ../mock-store-web
cp .env.local.example .env.local
npm install
npm run dev
```

Default storefront URL:

- `http://localhost:3003`

### 4) Test checkout

1. Open `http://localhost:3003`.
2. Enter amount and order details.
3. Click Create KHQR Intent.
4. Scan displayed QR.
5. Observe status updates and webhook inbox events.

## Configuration reference

### `mock-store-api/.env`

| Variable                          | Required | Description                            | Example                                            |
| --------------------------------- | -------- | -------------------------------------- | -------------------------------------------------- |
| `PORT`                            | No       | API listen port                        | `4000`                                             |
| `WEB_ORIGIN`                      | Yes      | Allowed CORS origins (comma-separated) | `http://localhost:3003`                            |
| `OPEN_BANKING_BASE_URL`           | Yes      | Open Banking backend URL               | `http://localhost:8000` or `http://localhost:8080` |
| `MERCHANT_ID`                     | Yes      | Merchant UUID                          | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`             |
| `MERCHANT_API_SIGNING_SECRET`     | Yes      | Secret used to sign create-intent      | secret value                                       |
| `MERCHANT_WEBHOOK_SIGNING_SECRET` | Yes      | Secret used to verify incoming webhook | secret value                                       |
| `DEFAULT_EXPIRES_IN_MINUTES`      | No       | Fallback intent expiry                 | `3`                                                |

Note:

- `mock-store-api` loads `.env` at runtime from its own folder.
- Open Banking direct run uses port `8000`; Open Banking Docker compose host mapping often uses `8080`.

### `mock-store-web/.env.local`

| Variable                         | Required | Description           | Example                 |
| -------------------------------- | -------- | --------------------- | ----------------------- |
| `NEXT_PUBLIC_STORE_API_BASE_URL` | Yes      | Base URL for mock API | `http://localhost:4000` |
| `NEXT_PUBLIC_API_URL`            | No       | Fallback API base URL | `http://localhost:4000` |

## API reference (mock-store-api)

| Method | Endpoint                                | Purpose                                             |
| ------ | --------------------------------------- | --------------------------------------------------- |
| `GET`  | `/store/health`                         | Health check                                        |
| `POST` | `/store/checkout-intents`               | Create checkout intent through signed upstream call |
| `GET`  | `/store/checkout-status/:checkoutToken` | Proxy checkout status lookup                        |
| `POST` | `/store/webhooks/payment-updates`       | Receive and verify signed webhook from Open Banking |
| `GET`  | `/store/webhooks/events`                | Inspect in-memory webhook inbox                     |

### Create intent payload

`POST /store/checkout-intents`

```json
{
  "amount": 12.5,
  "currency": "KHR",
  "description": "Order #1001",
  "expiresInMinutes": 15,
  "merchantOrderId": "ORDER-1001"
}
```

Validation highlights:

- `amount` required and positive
- `currency` max 3 chars
- `description` max 500 chars
- `expiresInMinutes` between 1 and 180
- `merchantOrderId` max 120 chars

## Docker deployment (mock API only)

Use this mode when storefront is hosted separately (for example Vercel) and only the mock API needs server hosting.

### 1) Prepare env file

```bash
cd mock-store-api
cp .env.example .env
```

Set:

- `WEB_ORIGIN=https://<your-frontend-domain>`
- `OPEN_BANKING_BASE_URL=<your-open-banking-url>`
- `MERCHANT_ID`, `MERCHANT_API_SIGNING_SECRET`, `MERCHANT_WEBHOOK_SIGNING_SECRET`

### 2) Build and start container

From `mock-khqr/`:

```bash
docker compose -f docker-compose.mock-api.yml up -d --build
```

Fallback for legacy compose binary:

```bash
docker-compose -f docker-compose.mock-api.yml up -d --build
```

Or use helper script (auto-detects compose command):

```bash
bash scripts/deploy-mock-api.sh
```

### 3) Verify health

```bash
curl -sS http://localhost:4000/store/health
```

## Domain + SSL setup

For public HTTPS endpoint with Nginx and Let's Encrypt:

```bash
sudo bash scripts/setup-mock-api-domain.sh <api-domain> <email>
```

The script:

- installs Nginx + Certbot
- deploys `nginx/mock-store-api.conf`
- provisions SSL cert
- sets renewal cron

## Integration tips

- Keep merchant secrets synchronized with Open Banking merchant settings.
- If create-intent fails with invalid signature, verify `MERCHANT_API_SIGNING_SECRET` first.
- The mock API can retry with webhook secret if API signing secret is wrong, but this should be treated as temporary fallback only.
- For realistic browser CORS behavior, explicitly set `WEB_ORIGIN` including local and deployed frontend origins.

## Troubleshooting

### `MERCHANT_ID is not configured`

Set `MERCHANT_ID` in `mock-store-api/.env` and restart API.

### `Invalid request signature` from upstream

- Confirm `MERCHANT_API_SIGNING_SECRET` matches Open Banking merchant record.
- Confirm merchant is approved and has checkout enabled.

### Webhooks not appearing in inbox

- Confirm merchant `webhook_url` points to `/store/webhooks/payment-updates`.
- Confirm Open Banking can reach this host/port.
- Check `MERCHANT_WEBHOOK_SIGNING_SECRET` and timestamp/signature headers.

### Storefront cannot reach mock API

- Verify `NEXT_PUBLIC_STORE_API_BASE_URL` in `mock-store-web/.env.local`.
- Confirm API is running on port `4000`.
- Check CORS via `WEB_ORIGIN`.

### Wrong Open Banking port

- Open Banking direct run: usually `http://localhost:8000`
- Open Banking docker-compose host mapping: often `http://localhost:8080`

Set `OPEN_BANKING_BASE_URL` accordingly.

## Related resources

- Open Banking quick start: [../docs/CHECKOUT_QUICK_START.md](../docs/CHECKOUT_QUICK_START.md)
- Open Banking integration details: [../docs/CHECKOUT_API_INTEGRATION.md](../docs/CHECKOUT_API_INTEGRATION.md)
- Component guides:
  - [mock-store-web/KHQR_COMPONENT_GUIDE.md](mock-store-web/KHQR_COMPONENT_GUIDE.md)
  - [mock-store-web/MERCHANT_GUIDE.md](mock-store-web/MERCHANT_GUIDE.md)
- Reference repository: [raksmey-pol/mock-khqr](https://github.com/raksmey-pol/mock-khqr)
