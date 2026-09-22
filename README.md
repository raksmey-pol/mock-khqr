# Mock KHQR Integration Sandbox

End-to-end merchant checkout sandbox for testing the KHQR flow against the Open Banking backend.

The sandbox is a single Next.js app (`mock-store-web/`) that serves both:

- the mock storefront UI, and
- the mock merchant API (Route Handlers under `app/store/*`) that signs checkout requests and verifies webhooks.

> Previously the mock merchant API ran as a separate NestJS service (`mock-store-api/`). It has been moved into the Next.js app; all API paths are unchanged.

## Table of contents

- [Overview](#overview)
- [Flow](#flow)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Configuration reference](#configuration-reference)
- [API reference](#api-reference)
- [Docker deployment](#docker-deployment)
- [Domain + SSL setup](#domain--ssl-setup)
- [Integration tips](#integration-tips)
- [Troubleshooting](#troubleshooting)
- [Related resources](#related-resources)

## Overview

This sandbox is intended for merchants and integrators who want to validate the full checkout lifecycle:

1. Storefront creates an intent through the mock merchant API.
2. Mock merchant API signs and forwards the request to Open Banking `POST /api/checkout/intents`.
3. Storefront shows KHQR and polls checkout status.
4. Open Banking sends signed webhook updates to the mock merchant API.

## Flow

```text
Mock Storefront (Next.js browser UI)
  -> POST /store/checkout-intents

Mock Merchant API (Next.js route handlers)
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
├── mock-store-web/
│   ├── app/
│   │   ├── store/                      # mock merchant API route handlers
│   │   │   ├── health/
│   │   │   ├── checkout-intents/
│   │   │   ├── checkout-status/[checkoutToken]/
│   │   │   └── webhooks/
│   │   ├── page.tsx                    # storefront checkout UI
│   │   └── khqr-demo/
│   ├── server/                         # signing, validation, webhook store
│   ├── components/
│   ├── .env.example
│   └── Dockerfile
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

### 1) Configure and start the app

```bash
cd mock-store-web
cp .env.example .env.local
npm install
npm run dev
```

Set the Open Banking values in `.env.local` (`OPEN_BANKING_BASE_URL`, `MERCHANT_ID`, signing secrets).

By default, storefront + API run on:

- `http://localhost:3003`

The mock API is served by the same app under `/store/*`:

- Health: `http://localhost:3003/store/health`

### 2) Set merchant webhook URL in Open Banking

Set merchant `webhook_url` to:

- `http://localhost:3003/store/webhooks/payment-updates`

If Open Banking runs in Docker and cannot reach host localhost, use a host-reachable endpoint (for example `host.docker.internal` where supported).

### 3) Test checkout

1. Open `http://localhost:3003`.
2. Enter amount and order details.
3. Click Create KHQR Intent.
4. Scan displayed QR.
5. Observe status updates and webhook inbox events.

## Configuration reference

### `mock-store-web/.env.local` (local) / `mock-store-web/.env` (docker)

| Variable                          | Required | Description                                   | Example                                            |
| --------------------------------- | -------- | --------------------------------------------- | -------------------------------------------------- |
| `OPEN_BANKING_BASE_URL`           | Yes      | Open Banking backend URL                      | `http://localhost:8000` or `http://localhost:8080` |
| `MERCHANT_ID`                     | Yes      | Merchant UUID                                 | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`             |
| `MERCHANT_API_SIGNING_SECRET`     | Yes      | Secret used to sign create-intent             | secret value                                       |
| `MERCHANT_WEBHOOK_SIGNING_SECRET` | Yes      | Secret used to verify incoming webhook        | secret value                                       |
| `WEB_ORIGIN`                      | No       | CORS allowlist for `/store/*` (empty = allow) | `https://store.example.com`                        |
| `DEFAULT_CURRENCY`                | No       | Fallback intent currency                      | `KHR`                                              |
| `DEFAULT_EXPIRES_IN_MINUTES`      | No       | Fallback intent expiry                        | `3`                                                |

Optional browser override:

| Variable                         | Required | Description                                                         | Example                 |
| -------------------------------- | -------- | ------------------------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_STORE_API_BASE_URL` | No       | Base URL for a separately hosted mock API. Defaults to same origin. | `http://localhost:4000` |
| `NEXT_PUBLIC_API_URL`            | No       | Fallback for `NEXT_PUBLIC_STORE_API_BASE_URL`                       | `http://localhost:4000` |

Notes:

- Next.js loads `.env.local` automatically for local dev/start; `docker-compose.mock-api.yml` passes `mock-store-web/.env` to the container.
- Keep server values unprefixed (no `NEXT_PUBLIC_`) so they never reach the browser.
- Open Banking direct run uses port `8000`; Open Banking Docker compose host mapping often uses `8080`.

## API reference

Served by Next.js Route Handlers in `mock-store-web/app/store/`.

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

## Docker deployment

Use this mode when the app needs server hosting (storefront + API in one container).

### 1) Prepare env file

```bash
cd mock-store-web
cp .env.example .env
```

Set:

- `OPEN_BANKING_BASE_URL=<your-open-banking-url>`
- `MERCHANT_ID`, `MERCHANT_API_SIGNING_SECRET`, `MERCHANT_WEBHOOK_SIGNING_SECRET`
- `WEB_ORIGIN=https://<your-frontend-domain>` (only if the storefront is hosted elsewhere)

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

The container serves the storefront and the `/store/*` API on `127.0.0.1:4000`.

If you previously ran the old NestJS container, remove it once:

```bash
docker rm -f mock-store-api
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
- deploys `nginx/mock-store-api.conf` (proxies the app on port `4000`, so both the storefront and the `/store/*` API are available on the domain)
- provisions SSL cert
- sets renewal cron

## Integration tips

- Keep merchant secrets synchronized with Open Banking merchant settings.
- If create-intent fails with invalid signature, verify `MERCHANT_API_SIGNING_SECRET` first.
- The mock API can retry with webhook secret if API signing secret is wrong, but this should be treated as temporary fallback only.
- The webhook inbox is in-memory per server instance; it resets on restart.
- For realistic browser CORS behavior, explicitly set `WEB_ORIGIN` when the storefront is hosted on a different domain.

## Troubleshooting

### `MERCHANT_ID is not configured`

Set `MERCHANT_ID` in `mock-store-web/.env.local` (or `.env` for Docker) and restart the app.

### `Invalid request signature` from upstream

- Confirm `MERCHANT_API_SIGNING_SECRET` matches Open Banking merchant record.
- Confirm merchant is approved and has checkout enabled.

### Webhooks not appearing in inbox

- Confirm merchant `webhook_url` points to `/store/webhooks/payment-updates`.
- Confirm Open Banking can reach this host/port.
- Check `MERCHANT_WEBHOOK_SIGNING_SECRET` and timestamp/signature headers.

### Storefront cannot reach the mock API

- Confirm the app is running (dev: port `3003`, Docker: port `4000`).
- Unless `NEXT_PUBLIC_STORE_API_BASE_URL` is set, the storefront calls the API on its own origin.

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
