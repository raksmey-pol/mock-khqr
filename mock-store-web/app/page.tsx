"use client";

import { useEffect, useMemo, useState } from "react";
import { KhqrCard } from "@/components";

type CreateIntentPayload = {
  amount: number;
  currency?: string;
  description?: string;
  expiresInMinutes?: number;
  merchantOrderId?: string;
};

type IntentResponse = {
  paymentId: string;
  paymentRef: string;
  status: string;
  amount: number;
  currency: string;
  qrPayload: string;
  khqrMd5: string;
  paymentExpiresAt: string;
  checkoutToken: string;
  checkoutTokenExpiresAt: string;
};

type CheckoutStatus = {
  paymentId: string;
  paymentRef: string;
  status: string;
  amount: number;
  currency: string;
  paymentExpiresAt: string;
  updatedAt: string;
};

type WebhookEnvelope = {
  count: number;
  events: Array<{
    receivedAt: string;
    deliveryId: string | null;
    timestamp: string | null;
    payload: unknown;
  }>;
};

const FINAL_STATUSES = new Set(["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"]);
const STATUS_POLL_INTERVAL_MS = 3500;
const POST_EXPIRY_POLL_GRACE_MS = 2 * 60 * 1000;

function extractMerchantNameFromKhqrPayload(
  qrPayload: string | null | undefined,
): string | null {
  if (!qrPayload) {
    return null;
  }

  let cursor = 0;
  while (cursor + 4 <= qrPayload.length) {
    const tag = qrPayload.slice(cursor, cursor + 2);
    const lengthText = qrPayload.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(lengthText)) {
      return null;
    }

    const valueLength = Number(lengthText);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + valueLength;
    if (valueEnd > qrPayload.length) {
      return null;
    }

    const value = qrPayload.slice(valueStart, valueEnd);
    if (tag === "59") {
      const merchantName = value.trim();
      return merchantName.length > 0 ? merchantName : null;
    }

    cursor = valueEnd;
  }

  return null;
}

function getClosedQrLabel(status: string | null): string {
  switch (status) {
    case "COMPLETED":
      return "PAID";
    case "EXPIRED":
      return "EXPIRED";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "CLOSED";
  }
}

export default function HomePage() {
  const apiBase = (
    process.env.NEXT_PUBLIC_STORE_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000"
  ).replace(/\/$/, "");

  const [amount, setAmount] = useState("12.5");
  const [description, setDescription] = useState("Mock order from storefront");
  const [merchantOrderId, setMerchantOrderId] = useState(`ORDER-${Date.now()}`);
  const [receiverName, setReceiverName] = useState("Mock Merchant");
  const [isReceiverNameEdited, setIsReceiverNameEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEnvelope | null>(null);

  const activeStatus = status?.status ?? intent?.status ?? null;
  const isQrClosed = Boolean(activeStatus && FINAL_STATUSES.has(activeStatus));
  const qrClosedLabel = getClosedQrLabel(activeStatus);
  const displayReceiverName = receiverName.trim() || "Mock Merchant";

  const shouldContinueExpiredPolling = useMemo(() => {
    if (activeStatus !== "EXPIRED" || !intent?.checkoutTokenExpiresAt) {
      return false;
    }

    const expiresAt = new Date(intent.checkoutTokenExpiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return false;
    }

    return Date.now() <= expiresAt + POST_EXPIRY_POLL_GRACE_MS;
  }, [activeStatus, intent?.checkoutTokenExpiresAt, status?.updatedAt]);

  const canPoll = useMemo(
    () =>
      Boolean(
        intent?.checkoutToken &&
        activeStatus &&
        (!FINAL_STATUSES.has(activeStatus) || shouldContinueExpiredPolling),
      ),
    [intent?.checkoutToken, activeStatus, shouldContinueExpiredPolling],
  );

  async function createIntent() {
    setLoading(true);
    setError(null);
    setIntent(null);
    setStatus(null);
    try {
      const payload: CreateIntentPayload = {
        amount: Number(amount),
        description,
        merchantOrderId,
      };

      const response = await fetch(`${apiBase}/store/checkout-intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text();
      const body = bodyText ? JSON.parse(bodyText) : null;
      if (!response.ok) {
        throw new Error(body?.message ?? `Request failed (${response.status})`);
      }

      const intentResponse = body as IntentResponse;
      setIntent(intentResponse);

      if (!isReceiverNameEdited) {
        const merchantName = extractMerchantNameFromKhqrPayload(
          intentResponse.qrPayload,
        );
        if (merchantName) {
          setReceiverName(merchantName);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create checkout intent",
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchStatus(checkoutToken: string) {
    try {
      const response = await fetch(
        `${apiBase}/store/checkout-status/${encodeURIComponent(checkoutToken)}`,
      );
      const bodyText = await response.text();
      const body = bodyText ? JSON.parse(bodyText) : null;
      if (!response.ok) {
        throw new Error(
          body?.message ?? `Status lookup failed (${response.status})`,
        );
      }
      setStatus(body as CheckoutStatus);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch checkout status",
      );
    }
  }

  async function fetchWebhookEvents() {
    try {
      const response = await fetch(`${apiBase}/store/webhooks/events`);
      const body = (await response.json()) as WebhookEnvelope;
      setWebhooks(body);
    } catch {
      // Ignore webhook panel errors to keep checkout flow smooth.
    }
  }

  useEffect(() => {
    if (!intent?.checkoutToken) {
      return;
    }

    void fetchStatus(intent.checkoutToken);
    void fetchWebhookEvents();

    const webhookInterval = window.setInterval(() => {
      void fetchWebhookEvents();
    }, 4000);

    return () => {
      window.clearInterval(webhookInterval);
    };
  }, [intent?.checkoutToken]);

  useEffect(() => {
    if (!intent?.checkoutToken || !canPoll) {
      return;
    }

    const pollInterval = window.setInterval(() => {
      void fetchStatus(intent.checkoutToken);
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollInterval);
    };
  }, [intent?.checkoutToken, canPoll]);

  return (
    <main>
      <div className="shell">
        <section className="hero">
          <h1>Mock KHQR Store</h1>
          <p>
            Create a checkout intent from your mock merchant backend, show KHQR,
            and watch status + webhook updates live.
          </p>
        </section>

        {error ? <div className="alert">{error}</div> : null}

        <section className="grid">
          <article className="card">
            <h2>Create Checkout Intent</h2>
            <p className="muted">
              This sends a signed server-to-server request through NestJS.
            </p>

            <div className="form">
              <label>
                Amount
                <input
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  min="0.01"
                  step="0.01"
                />
              </label>

              <label>
                Description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>

              <label>
                Merchant Order ID
                <input
                  type="text"
                  value={merchantOrderId}
                  onChange={(event) => setMerchantOrderId(event.target.value)}
                />
              </label>

              <label>
                Receiver Name (for KHQR card)
                <input
                  type="text"
                  value={receiverName}
                  onChange={(event) => {
                    setIsReceiverNameEdited(true);
                    setReceiverName(event.target.value);
                  }}
                />
              </label>

              <button type="button" onClick={createIntent} disabled={loading}>
                {loading ? "Creating intent..." : "Create KHQR Intent"}
              </button>
            </div>
          </article>

          <article className="card panel-list">
            <h2>Checkout Session</h2>
            {!intent ? (
              <p className="muted">Create an intent first.</p>
            ) : (
              <>
                <div>
                  <span className={`status-chip status-${activeStatus}`}>
                    {activeStatus}
                  </span>
                  {activeStatus === "EXPIRED" &&
                  shouldContinueExpiredPolling ? (
                    <p className="muted" style={{ marginTop: 8 }}>
                      Verifying final settlement... status may still change to
                      COMPLETED shortly.
                    </p>
                  ) : null}
                </div>

                <div className="inline-pairs">
                  <div className="inline-pair">
                    <span>Payment Ref</span>
                    <strong>{intent.paymentRef}</strong>
                  </div>
                  <div className="inline-pair">
                    <span>Amount</span>
                    <strong>
                      {intent.amount} {intent.currency}
                    </strong>
                  </div>
                  <div className="inline-pair">
                    <span>Checkout Token Expires</span>
                    <strong>
                      {new Date(intent.checkoutTokenExpiresAt).toLocaleString()}
                    </strong>
                  </div>
                  {status?.updatedAt ? (
                    <div className="inline-pair">
                      <span>Last Status Update</span>
                      <strong>
                        {new Date(status.updatedAt).toLocaleString()}
                      </strong>
                    </div>
                  ) : null}
                </div>

                <div className="card" style={{ padding: 12 }}>
                  <h3>KHQR Payment Card</h3>
                  <div
                    style={{
                      marginTop: 10,
                      display: "grid",
                      placeItems: "center",
                      gap: 12,
                    }}
                  >
                    <KhqrCard
                      receiverName={displayReceiverName}
                      amount={intent.amount}
                      currency={intent.currency}
                      qrData={intent.qrPayload}
                      scanDisabled={isQrClosed}
                      disabledLabel={qrClosedLabel}
                      width={280}
                    />
                    <span className="muted">
                      {isQrClosed
                        ? "QR closed. Create a new checkout intent for another payment."
                        : "Scan using Bakong app"}
                    </span>
                  </div>
                </div>

                <details>
                  <summary>Show raw payloads</summary>
                  <div className="payload" style={{ marginTop: 10 }}>
                    {JSON.stringify({ intent, status }, null, 2)}
                  </div>
                </details>
              </>
            )}
          </article>
        </section>

        <section className="card">
          <h2>Webhook Inbox (Mock Merchant Backend)</h2>
          <p className="muted">
            This shows recent webhook deliveries received at{" "}
            <strong>/store/webhooks/payment-updates</strong>.
          </p>
          {!webhooks?.events?.length ? (
            <p className="muted">No webhook events received yet.</p>
          ) : (
            <div className="panel-list" style={{ marginTop: 8 }}>
              {webhooks.events.slice(0, 5).map((event) => (
                <div
                  key={`${event.deliveryId ?? "n/a"}-${event.receivedAt}`}
                  className="payload"
                >
                  {JSON.stringify(event, null, 2)}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
