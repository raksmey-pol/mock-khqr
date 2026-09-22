# Mock KHQR Integration Sandbox

End-to-end merchant checkout sandbox for testing the KHQR flow: the mock merchant API generates KHQR payloads locally (no Open Banking dependency) and tracks payment status from signed webhooks.

The sandbox is a single Next.js app (`mock-store-web/`) that serves both:

- the mock storefront UI, and
- the mock merchant API (Route Handlers under `app/store/*`) that generates Bakong KHQR payloads locally and tracks payment status from signed webhooks.

> Previously the mock merchant API ran as a separate NestJS service (`mock-store-api/`). It has been moved into the Next.js app; all API paths are unchanged.

## Table of contents

- [Overview](#overview)
- [Flow](#flow)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Configuration reference](#configuration-reference)
- [API reference](#api-reference)
- [Status lifecycle](#status-lifecycle)
- [Docker deployment](#docker-deployment)
- [Domain + SSL setup](#domain--ssl-setup)
- [Integration tips](#integration-tips)
- [Troubleshooting](#troubleshooting)
- [Related resources](#related-resources)

## Overview

This sandbox is intended for merchants and integrators who want to validate the full checkout lifecycle:

1. Storefront creates an intent through the mock merchant API.
2. Mock merchant API generates a Bakong KHQR locally with the official `bakong-khqr` SDK (no upstream call).
3. Storefront shows the KHQR and polls checkout status.
4. Signed webhook deliveries (same contract as Open Banking `payment.status_changed` events) update the stored intent status.

## Flow

```text
Mock Storefront (Next.js browser UI)
  -> POST /store/checkout-intents

Mock Merchant API (Next.js route handlers)
  -> generates KHQR locally (bakong-khqr SDK)
  <- qrPayload + khqrMd5 + checkoutToken

Mock Storefront
  -> GET /store/checkout-status/:checkoutToken (local status)

Webhook sender (Open Banking / test tool)
  -> POST /store/webhooks/payment-updates (signed)
     -> updates intent status: PENDING -> COMPLETED / FAILED / EXPIRED / CANCELLED
```

## Project structure

```text
mock-khqr/
├── mock-store-web/
│   ├── app/
│   │   ├── store/[...path]/route.ts    # mock merchant API (all /store/* endpoints)
│   │   ├── page.tsx                    # storefront checkout UI
│   │   └── khqr-demo/
│   ├── server/                         # KHQR generation, intent store, validation, webhook store
│   ├── types/                          # bakong-khqr SDK type declarations
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
- A Bakong account with a KHQR profile (the account ID embedded in generated QRs, e.g. `yourname@aclb`)
- A webhook signing secret shared with whoever delivers payment status webhooks (Open Banking backend or a test tool)

## Quick start (local)

Run all commands from this directory (`mock-khqr/`).

### 1) Configure and start the app

```bash
cd mock-store-web
cp .env.example .env.local
npm install
npm run dev
```

Set the Bakong values in `.env.local` (`BAKONG_ACCOUNT_ID`, and optionally `MERCHANT_NAME`, `MERCHANT_CITY`, `MERCHANT_WEBHOOK_SIGNING_SECRET`).

By default, storefront + API run on:

- `http://localhost:3003`

The mock API is served by the same app under `/store/*`:

- Health: `http://localhost:3003/store/health`

### 2) Point the webhook sender at this app

Configure the sender (Open Banking backend or a test tool) to deliver payment status webhooks to:

- `http://localhost:3003/store/webhooks/payment-updates`

If the sender runs in Docker and cannot reach host localhost, use a host-reachable endpoint (for example `host.docker.internal` where supported).

### 3) Test checkout

1. Open `http://localhost:3003`.
2. Enter amount and order details.
3. Click Create KHQR Intent.
4. Scan displayed QR.
5. Observe status updates and webhook inbox events.

## Configuration reference

### `mock-store-web/.env.local` (local) / `mock-store-web/.env` (docker)

| Variable                          | Required | Description                                   | Example                     |
| --------------------------------- | -------- | --------------------------------------------- | --------------------------- |
| `BAKONG_ACCOUNT_ID`               | Yes      | Bakong account ID embedded in the QR (tag 29) | `yourname@aclb`             |
| `MERCHANT_NAME`                   | No       | Merchant name shown in the QR (tag 59)        | `Mock Merchant`             |
| `MERCHANT_CITY`                   | No       | Merchant city shown in the QR (tag 60)        | `Phnom Penh`                |
| `ACQUIRING_BANK`                  | No       | Optional tag 29 field                         | bank code                   |
| `ACCOUNT_INFORMATION`             | No       | Optional tag 29 field                         | account number              |
| `MERCHANT_WEBHOOK_SIGNING_SECRET` | Yes      | Secret used to verify incoming webhooks       | secret value                |
| `WEB_ORIGIN`                      | No       | CORS allowlist for `/store/*` (empty = allow) | `https://store.example.com` |
| `DEFAULT_CURRENCY`                | No       | Fallback intent currency (`KHR` or `USD`)     | `KHR`                       |
| `DEFAULT_EXPIRES_IN_MINUTES`      | No       | Fallback intent expiry                        | `3`                         |

`MOBILE_NUMBER`, `STORE_LABEL`, and `TERMINAL_LABEL` are also accepted as optional tag 62 fields.

Optional browser override:

| Variable                         | Required | Description                                                         | Example                 |
| -------------------------------- | -------- | ------------------------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_STORE_API_BASE_URL` | No       | Base URL for a separately hosted mock API. Defaults to same origin. | `http://localhost:4000` |
| `NEXT_PUBLIC_API_URL`            | No       | Fallback for `NEXT_PUBLIC_STORE_API_BASE_URL`                       | `http://localhost:4000` |

Notes:

- Next.js loads `.env.local` automatically for local dev/start; `docker-compose.mock-api.yml` passes `mock-store-web/.env` to the container.
- Keep server values unprefixed (no `NEXT_PUBLIC_`) so they never reach the browser.
- Bakong KHQR rules: KHR amounts must be whole numbers; USD allows up to 2 decimals. Currency must be `KHR` or `USD`.

## API reference

Served by a single Next.js Route Handler (`mock-store-web/app/store/[...path]/route.ts`) so every endpoint runs in the same function and shares the in-memory intent store.

| Method | Endpoint                                | Purpose                                        |
| ------ | --------------------------------------- | ---------------------------------------------- |
| `GET`  | `/store/health`                         | Health check                                   |
| `POST` | `/store/checkout-intents`               | Generate a Bakong KHQR intent locally          |
| `GET`  | `/store/checkout-status/:checkoutToken` | Read locally tracked checkout status           |
| `POST` | `/store/webhooks/payment-updates`       | Verify signed webhook and update intent status |
| `GET`  | `/store/webhooks/events`                | Inspect in-memory webhook inbox                |

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

- `amount` required and positive (KHR: whole numbers only, USD: max 2 decimals)
- `currency` max 3 chars, must resolve to `KHR` or `USD`
- `description` max 500 chars
- `expiresInMinutes` between 1 and 180
- `merchantOrderId` max 120 chars

### Webhook payload (accepted)

Same contract as Open Banking `payment.status_changed` events:

```json
{
  "eventType": "payment.status_changed",
  "occurredAt": "2026-03-30T13:32:10Z",
  "paymentId": "2f5a1d2e-7f6f-4cc2-9ca6-4c7dc9674d94",
  "paymentRef": "KHQR-1760000000123-A1B2C3",
  "status": "COMPLETED",
  "amount": 12.5,
  "currency": "KHR",
  "paymentExpiresAt": "2026-03-30T13:40:00Z",
  "updatedAt": "2026-03-30T13:32:10Z"
}
```

Signed with `hmacSha256(secret, timestamp + "\n" + rawBody)` and delivered with `X-Webhook-Timestamp`, `X-Webhook-Signature`, and `X-Webhook-Delivery-Id` headers.

## Status lifecycle

- New intents start as `PENDING`; they become `EXPIRED` locally once `paymentExpiresAt` passes (checked on status reads).
- Verified webhooks update the status: matched by `checkoutToken`, `khqrMd5`/`md5`, `paymentId`, or `paymentRef`/`billNumber`; the `status` field is normalized (`PAID` → `COMPLETED`, `UNPAID` → `PENDING`, `CANCELED` → `CANCELLED`, …).
- An accepted webhook responds with `{ ok: true, message: "Webhook accepted", matchedIntent: true|false }`.

## Docker deployment

Use this mode when the app needs server hosting (storefront + API in one container).

### 1) Prepare env file

```bash
cd mock-store-web
cp .env.example .env
```

Set:

- `BAKONG_ACCOUNT_ID=<your-bakong-account-id>`
- `MERCHANT_NAME`, `MERCHANT_CITY` (shown in the QR)
- `MERCHANT_WEBHOOK_SIGNING_SECRET=<shared secret>`
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

- Keep `MERCHANT_WEBHOOK_SIGNING_SECRET` synchronized with the sender; webhooks failing signature verification are rejected with `401`.
- Match webhooks to intents by `khqrMd5`/`md5` when the sender doesn't know this app's `paymentId`/`paymentRef` (for example a Bakong transaction watcher).
- Amounts follow KHQR rules: KHR whole numbers, USD max 2 decimals — violations return `400 Unable to generate KHQR: Amount is invalid`.
- The intent store and webhook inbox are in-memory per process; they reset on restart. All `/store/*` endpoints share one route handler so a serverless demo keeps them in the same function instance — for guaranteed consistency (cold starts, scaling) run the app as a single Node process (Docker).
- For realistic browser CORS behavior, explicitly set `WEB_ORIGIN` when the storefront is hosted on a different domain.

## Troubleshooting

### `BAKONG_ACCOUNT_ID is not configured`

Set `BAKONG_ACCOUNT_ID` in `mock-store-web/.env.local` (or `.env` for Docker) and restart the app.

### `Invalid webhook signature`

- Confirm `MERCHANT_WEBHOOK_SIGNING_SECRET` matches the sender configuration.
- The signature covers `timestamp + "\n" + rawBody` (see Open Banking docs `CHECKOUT_API_INTEGRATION.md`).

### Webhooks not appearing in inbox

- Confirm the sender's webhook URL points to `/store/webhooks/payment-updates`.
- Confirm the sender can reach this host/port.
- Check `MERCHANT_WEBHOOK_SIGNING_SECRET` and the timestamp/signature headers.

### Storefront cannot reach the mock API

- Confirm the app is running (dev: port `3003`, Docker: port `4000`).
- Unless `NEXT_PUBLIC_STORE_API_BASE_URL` is set, the storefront calls the API on its own origin.

### Status stays `PENDING` after a webhook

- The webhook was accepted but matched no intent — check `matchedIntent` in the response.
- Match keys: `checkoutToken`, `khqrMd5`/`md5`, `paymentId`, `paymentRef`/`billNumber`.

## Related resources

- Open Banking quick start: [../banking-openapi/docs/CHECKOUT_QUICK_START.md](../banking-openapi/docs/CHECKOUT_QUICK_START.md)
- Open Banking integration details: [../banking-openapi/docs/CHECKOUT_API_INTEGRATION.md](../banking-openapi/docs/CHECKOUT_API_INTEGRATION.md)
- Component guides:
  - [mock-store-web/KHQR_COMPONENT_GUIDE.md](mock-store-web/KHQR_COMPONENT_GUIDE.md)
  - [mock-store-web/MERCHANT_GUIDE.md](mock-store-web/MERCHANT_GUIDE.md)
- Reference repository: [raksmey-pol/mock-khqr](https://github.com/raksmey-pol/mock-khqr)
