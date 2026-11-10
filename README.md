# Mock KHQR Integration Sandbox

End-to-end merchant checkout sandbox for testing the KHQR flow: the mock merchant API generates KHQR payloads locally (no Open Banking dependency) and tracks payment status from signed webhooks.

The sandbox is a single Next.js app (`mock-store-web/`) that serves both:

- the mock storefront UI, and
- the mock merchant API (Route Handlers under `app/store/*`) that generates Bakong KHQR payloads locally and tracks payment status from signed webhooks.

> Previously the mock merchant API ran as a separate NestJS service (`mock-store-api/`). It has been moved into the Next.js app; all API paths are unchanged.

## Table of contents

- [Overview](#overview)
- [Flow](#flow)
- [Bakong checkout page mode](#bakong-checkout-page-mode)
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

Optionally (see [Bakong checkout page mode](#bakong-checkout-page-mode)) the storefront can skip the embedded QR card and host checkout on the real Bakong checkout page.

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

### Bakong checkout page mode

With the "Use Bakong checkout page" settings switch on the mock storefront enabled, the flow changes (see [Bakong checkout page mode](#bakong-checkout-page-mode)).

## Bakong checkout page mode

The storefront has a **Settings** section with a switch: **Use Bakong checkout page**. When enabled, checkout follows the Bakong hosted checkout page v1 integration contract instead of the locally generated KHQR card:

```text
Mock Storefront (browser)
  -> POST /store/checkout/sessions

Mock Merchant API (this app, acting as the merchant backend)
  -> POST {BAKONG_OPEN_API_BASE_URL}/v1/checkout/sessions  (Bearer BAKONG_MERCHANT_TOKEN)
  <- checkout_url + session_id + md5

Mock Storefront
  -> embeds checkout_url in an iframe  (iframe mode)
     or window.location = checkout_url (full-page redirect mode)

Bakong hosted checkout page
  -> shows QR + amount + countdown, customer pays in a banking app

Mock Merchant API (in-process waiter)
  -> GET {BAKONG_OPEN_API_BASE_URL}/v1/checkout/sessions/{id}?wait=true&w=90 (long-poll until terminal)
  <- locally tracked session: PENDING -> SCANNED -> SUCCESS / FAILED / TIMEOUT / EXPIRED / CANCELLED

Mock Storefront
  -> GET /store/checkout/sessions/:sessionId (local status, poll every ~3.5s)
```

### Requirements

| Variable | Required | Description |
| --- | --- | --- |
| `BAKONG_OPEN_API_BASE_URL` | Yes | Bakong Open API base that serves `/v1/checkout/sessions*` (issued during onboarding) |
| `BAKONG_MERCHANT_TOKEN` | Yes | `mbk...` merchant token; server-side only, never exposed to the browser |
| `CHECKOUT_SUCCESS_URL` | No | Default success redirect target (HTTPS on a Bakong-verified domain, supports `{BILL_NO}`) |
| `CHECKOUT_EXPIRY_SECONDS` | No | Default session expiry in seconds (60–600, default 300) |

If any of the required variables is missing, creating a session fails with a descriptive 500 error; the switch stays visible so the config problem is obvious.

### Presentation modes

The settings expose a presentation choice implemented exactly as the guide prescribes:

- **Embedded iframe** — `checkout_url` is framed on the storefront with `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` and `allow="clipboard-write"`. The storefront validates every `message` event: `event.origin` must equal the origin of `checkout_url` and `event.source` must be the frame window. `PAYMENT_SUCCESS`, `SESSION_EXPIRED`, and `SCANNED` messages are surfaced as banners — they are accelerators only; the storefront keeps polling the merchant backend and never fulfils from the message.
- **Full-page redirect** — the storefront navigates to `checkout_url`. On success the hosted page shows a paid confirmation for ~1.5s and then redirects to the success URL with `{BILL_NO}` substituted plus `&status=SUCCESS`. When the browser returns, the storefront shows an idempotent notice (taken from the query string) and continues to rely on the server-side waiter — the redirect query string is never used for fulfilment.

### Session status lifecycle

```text
CREATED ──► SCANNED ──► SUCCESS
   │           │
   ├───────────┼──► FAILED
   ├───────────┼──► TIMEOUT
   ├───────────┼──► EXPIRED
   └───────────┴──► CANCELLED
```

The merchant backend enforces the guide's rules:

- statuses only move forward (`CREATED/PENDING -> SCANNED -> terminal`);
- terminal statuses are immutable;
- a settlement observed after `EXPIRED` is logged as **reversal evidence** and the session stays `EXPIRED`;
- `amount`, `currency`, and `billNo` are verified against the record on every remote update; a mismatch is logged and the remote status is **not** applied (no fulfilment);
- a pending session can be cancelled via the storefront (only while `PENDING`/`SCANNED`).

## Project structure

```text
mock-khqr/
├── mock-store-web/
│   ├── app/
│   │   ├── store/[...path]/route.ts    # mock merchant API (all /store/* endpoints)
│   │   ├── page.tsx                    # storefront checkout UI (KHQR + checkout page switch)
│   │   └── khqr-demo/
│   ├── server/                         # KHQR generation, intent store, checkout sessions, validation, webhook store
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

To test the hosted checkout page instead, flip **Use Bakong checkout page** in the Settings section of the storefront (requires the [checkout page environment variables](#bakong-checkout-page-mode)), then create a session and pay through the hosted page (bakong iframe/redirect flow; the webhook inbox is not used in this mode).

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
| `WEBHOOK_REQUIRE_SIGNATURE`       | No       | `false` accepts unsigned callbacks (testing)  | `true`                      |
| `BAKONG_OPEN_API_BASE_URL`        | See note | Checkout page mode: Bakong Open API base      | `https://api.bakong.nbc.gov.kh` |
| `BAKONG_MERCHANT_TOKEN`           | See note | Checkout page mode: `mbk...` token (server-side only) | `mbk.xxx`           |
| `CHECKOUT_SUCCESS_URL`            | No       | Checkout page mode: default success redirect target (`{BILL_NO}` supported) | `https://store.example.com/checkout/return?bill={BILL_NO}` |
| `CHECKOUT_EXPIRY_SECONDS`         | No       | Checkout page mode: default expiry (60–600)   | `300`                       |

`BAKONG_OPEN_API_BASE_URL` and `BAKONG_MERCHANT_TOKEN` are required when the storefront's "Use Bakong checkout page" settings switch is enabled; they are unused otherwise.

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

| Method | Endpoint                                        | Purpose                                        |
| ------ | ----------------------------------------------- | ---------------------------------------------- |
| `GET`  | `/store/health`                                 | Health check                                   |
| `POST` | `/store/checkout-intents`                       | Generate a Bakong KHQR intent locally          |
| `GET`  | `/store/checkout-status/:checkoutToken`         | Read locally tracked checkout status           |
| `POST` | `/store/checkout/sessions`                      | Mint a Bakong hosted checkout session          |
| `GET`  | `/store/checkout/sessions`                      | List locally tracked checkout sessions         |
| `GET`  | `/store/checkout/sessions/:sessionId`           | Read locally tracked checkout session status   |
| `POST` | `/store/checkout/sessions/:sessionId/cancel`    | Cancel a pending checkout session              |
| `POST` | `/store/webhooks/payment-updates`               | Verify signed webhook and update intent status |
| `GET`  | `/store/webhooks/events`                        | Inspect in-memory webhook inbox                |

### Create checkout session payload

`POST /store/checkout/sessions` (used by the checkout page mode; requires the checkout environment variables):

```json
{
  "amount": 15000,
  "currency": "KHR",
  "billNo": "BILL-2026-0001",
  "successUrl": "https://store.example.com/checkout/return?bill={BILL_NO}",
  "expirySeconds": 300,
  "description": "Order 2026-0001"
}
```

Validation highlights:

- `amount` required and positive (KHR: whole numbers only, USD: max 2 decimals)
- `currency` required, must be `KHR` or `USD`
- `billNo` required, 1–32 characters
- `description` max 128 chars
- `expirySeconds` integer between 60 and 600
- `successUrl` / `success_url` optional (must be identical if both are supplied); must be HTTPS

Minting sends `Idempotency-Key: <uuid>` (a fresh UUID per storefront attempt) and retries only transient failures (`429`, `5xx`, network errors) with the same key. Sessions are validated server-side (`wait=true&w=90` long-poll) and stored locally by `session_id`:

```json
{
  "sessionId": "4b0f3c2e-9c31-4c6d-a9ce-6f64f6f2cc23",
  "checkoutUrl": "https://checkout.bakong.nbc.gov.kh/c/eyJ...",
  "md5": "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "billNo": "BILL-2026-0001",
  "amount": 15000,
  "currency": "KHR",
  "status": "PENDING",
  "expiry": 1730000000,
  "successUrl": "https://store.example.com/checkout/return?bill={BILL_NO}"
}
```

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
- An accepted webhook responds `200` with the standard status envelope: `{"status":{"code":0,"errorCode":null,"error":null,"message":null,"warning":null}}`.
- Checkout sessions (checkout page mode) follow the [Bakong session lifecycle](#bakong-checkout-page-mode) with a forward-only status guard: statuses only move toward terminal (`SUCCESS`/`FAILED`/`TIMEOUT`/`EXPIRED`/`CANCELLED`), and `SUCCESS` is confirmed only from the Bakong Open API.

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

- Keep `MERCHANT_WEBHOOK_SIGNING_SECRET` synchronized with the sender; webhooks failing signature verification are rejected with `401`. Set `WEBHOOK_REQUIRE_SIGNATURE=false` to accept unsigned callbacks while testing with curl.
- Match webhooks to intents by `khqrMd5`/`md5` when the sender doesn't know this app's `paymentId`/`paymentRef` (for example a Bakong transaction watcher).
- Amounts follow KHQR rules: KHR whole numbers, USD max 2 decimals — violations return `400 Unable to generate KHQR: Amount is invalid`.
- The intent store and webhook inbox are in-memory per process; they reset on restart. All `/store/*` endpoints share one route handler so a serverless demo keeps them in the same function instance — for guaranteed consistency (cold starts, scaling) run the app as a single Node process (Docker).
- For realistic browser CORS behavior, explicitly set `WEB_ORIGIN` when the storefront is hosted on a different domain.
- Checkout page mode: keep `BAKONG_MERCHANT_TOKEN` server-side only (no `NEXT_PUBLIC_` prefix) — the merchant token never reaches the browser bundle.
- Checkout page mode: send a `successUrl` on the exact domain that embeds the iframe (or configure `CHECKOUT_SUCCESS_URL`) so the hosted page's `frame-ancestors` CSP and redirect target are deterministic.
- Checkout page mode: browser `postMessage` and the redirect query string are display accelerators only — the storefront always confirms through the locally tracked session that the waiter keeps up to date.
- Checkout page mode: the long-poll waiter re-arms on `PENDING` with jitter (250–750ms) and stops on any terminal status; idempotency keys are generated per mint attempt.

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

- The webhook was accepted but matched no intent — check the server log line `[mock-store] webhook processed (matchedIntent=...)`.
- Match keys: `checkoutToken`, `khqrMd5`/`md5`, `paymentId`, `paymentRef`/`billNumber`.

### Checkout page mode: `Bakong checkout is not configured`

- Set `BAKONG_OPEN_API_BASE_URL` and `BAKONG_MERCHANT_TOKEN` in `mock-store-web/.env.local` (or `.env` for Docker) and restart the app.

### Checkout page mode: `401`/`403` on create

- The merchant token is missing, revoked, or the merchant is suspended — rotate/configure the token through Bakong operations; check the server log for the exact code.

### Checkout page mode: `409` on create

- An active mint already exists for the bill number — the real API returns the existing session; retry the read or reconcile the bill state.

### Checkout page mode: `422` on create

- The idempotency key was reused with a different payload — the storefront generates a fresh UUID per attempt; avoid sending the same key with changed fields.

### Checkout page mode: iframe blank / CSP blocked

- The hosting domain must be a Bakong-verified domain and the session `successUrl` must be HTTPS on that domain (per session `frame-ancestors`). Fix the verified domain or send the exact success URL; the storefront always sends a `successUrl` from settings / `CHECKOUT_SUCCESS_URL` when configured.

### Checkout page mode: status stays `PENDING`

- The in-process waiter long-polls `GET /v1/checkout/sessions/{id}?wait=true&w=90` and re-arms on `PENDING` — check server logs for `checkout session waiter error`; if the process restarted, statuses resume from the next poll. Use `GET /store/checkout/sessions` as a reconciliation backstop.

### Checkout page mode: browser says success but session stays `PENDING`

- `postMessage` and the redirect query string are accelerators only; the waiter may still be holding a long-poll window. Wait for the next poll — fulfilment decisions are made server-side.

## Related resources

- Open Banking quick start: [../banking-openapi/docs/CHECKOUT_QUICK_START.md](../banking-openapi/docs/CHECKOUT_QUICK_START.md)
- Open Banking integration details: [../banking-openapi/docs/CHECKOUT_API_INTEGRATION.md](../banking-openapi/docs/CHECKOUT_API_INTEGRATION.md)
- Component guides:
  - [mock-store-web/KHQR_COMPONENT_GUIDE.md](mock-store-web/KHQR_COMPONENT_GUIDE.md)
  - [mock-store-web/MERCHANT_GUIDE.md](mock-store-web/MERCHANT_GUIDE.md)
- Reference repository: [raksmey-pol/mock-khqr](https://github.com/raksmey-pol/mock-khqr)
