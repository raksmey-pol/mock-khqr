"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type CheckoutPageMode = "iframe" | "redirect";

type CheckoutSettings = {
  useCheckoutPage: boolean;
  mode: CheckoutPageMode;
  currency: "KHR" | "USD";
  expirySeconds: number;
  successUrl: string;
};

type CheckoutSessionResponse = {
  sessionId: string;
  checkoutUrl: string;
  md5: string | null;
  billNo: string;
  amount: number;
  currency: string;
  status: string;
  paymentAt: string | null;
  expiry: number | null;
  description: string | null;
  successUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type CheckoutPageMessage = {
  type?: string;
  sessionId?: string;
};

type RedirectReturnNotice = {
  status: string;
  bill: string | null;
};

const FINAL_STATUSES = new Set(["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"]);
const STATUS_POLL_INTERVAL_MS = 3500;
const POST_EXPIRY_POLL_GRACE_MS = 2 * 60 * 1000;
const INTENT_STORAGE_KEY = "mock-store-web.checkout-intent";
const SETTINGS_STORAGE_KEY = "mock-store-web.checkout-settings";
const SESSION_STORAGE_KEY = "mock-store-web.checkout-session";

const CHECKOUT_FINAL_STATUSES = new Set([
  "SUCCESS",
  "FAILED",
  "TIMEOUT",
  "EXPIRED",
  "CANCELLED",
]);

const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  useCheckoutPage: false,
  mode: "iframe",
  currency: "KHR",
  expirySeconds: 300,
  successUrl: "",
};

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

function getCheckoutStatusLabel(status: string | null): string {
  if (!status) {
    return "—";
  }

  switch (status) {
    case "CREATED":
    case "PENDING":
      return "PENDING";
    case "SUCCESS":
      return "SUCCESS (PAID)";
    default:
      return status;
  }
}

function formatEpochSeconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }

  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function HomePage() {
  const apiBase = (
    process.env.NEXT_PUBLIC_STORE_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  ).replace(/\/$/, "");

  const [amount, setAmount] = useState("12.5");
  const [description, setDescription] = useState("Mock order from storefront");
  const [merchantOrderId, setMerchantOrderId] = useState(`ORDER-${Date.now()}`);
  const [receiverName, setReceiverName] = useState("Mock Merchant");
  const [isReceiverNameEdited, setIsReceiverNameEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<CheckoutSettings>(
    DEFAULT_CHECKOUT_SETTINGS,
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEnvelope | null>(null);

  const [checkoutSession, setCheckoutSession] =
    useState<CheckoutSessionResponse | null>(null);
  const [frameSignal, setFrameSignal] = useState<string | null>(null);
  const [redirectNotice, setRedirectNotice] =
    useState<RedirectReturnNotice | null>(null);

  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let restoredSettings = DEFAULT_CHECKOUT_SETTINGS;
    try {
      const rawSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as Partial<CheckoutSettings>;
        restoredSettings = {
          useCheckoutPage: parsed.useCheckoutPage === true,
          mode: parsed.mode === "redirect" ? "redirect" : "iframe",
          currency: parsed.currency === "USD" ? "USD" : "KHR",
          expirySeconds:
            typeof parsed.expirySeconds === "number" &&
            parsed.expirySeconds >= 60 &&
            parsed.expirySeconds <= 600
              ? Math.floor(parsed.expirySeconds)
              : DEFAULT_CHECKOUT_SETTINGS.expirySeconds,
          successUrl: typeof parsed.successUrl === "string" ? parsed.successUrl : "",
        };
        setSettings(restoredSettings);
      }
    } catch {
      // Ignore unreadable or tampered storage.
    }
    setSettingsLoaded(true);

    const redirectParams = new URLSearchParams(window.location.search);
    const redirectStatus = redirectParams.get("status");
    if (redirectStatus) {
      setRedirectNotice({ status: redirectStatus, bill: redirectParams.get("bill") });
    }

    if (restoredSettings.useCheckoutPage) {
      try {
        const storedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (storedSession) {
          const restored = JSON.parse(storedSession) as CheckoutSessionResponse;
          if (restored?.sessionId) {
            setCheckoutSession(restored);
          }
        }
      } catch {
        // Ignore unreadable or tampered storage.
      }
    } else {
      try {
        const stored = window.localStorage.getItem(INTENT_STORAGE_KEY);
        if (stored) {
          const restored = JSON.parse(stored) as IntentResponse;
          if (restored?.checkoutToken && restored?.qrPayload) {
            setIntent(restored);
            const merchantName = extractMerchantNameFromKhqrPayload(
              restored.qrPayload,
            );
            if (merchantName) {
              setReceiverName(merchantName);
            }
          }
        }
      } catch {
        // Ignore unreadable or tampered storage.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    } catch {
      // Storage can be unavailable (private mode); settings stay in-tab.
    }
  }, [settings, settingsLoaded]);

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

  const checkoutStatus = checkoutSession?.status ?? null;
  const isCheckoutTerminal = Boolean(
    checkoutStatus && CHECKOUT_FINAL_STATUSES.has(checkoutStatus),
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

      // Keep the intent in browser local storage so the page can keep polling
      // for webhook-driven status updates after a reload.
      try {
        window.localStorage.setItem(
          INTENT_STORAGE_KEY,
          JSON.stringify(intentResponse),
        );
      } catch {
        // Storage can be unavailable (private mode); polling still works in-tab.
      }

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

  async function createCheckoutSession() {
    setLoading(true);
    setError(null);
    setCheckoutSession(null);
    setFrameSignal(null);
    try {
      const expirySeconds =
        Number.isFinite(settings.expirySeconds) &&
        settings.expirySeconds >= 60 &&
        settings.expirySeconds <= 600
          ? Math.floor(settings.expirySeconds)
          : undefined;

      const payload: Record<string, unknown> = {
        amount: Number(amount),
        currency: settings.currency,
        billNo: merchantOrderId.trim(),
      };
      if (description.trim()) {
        payload.description = description.trim();
      }
      if (expirySeconds) {
        payload.expirySeconds = expirySeconds;
      }
      if (settings.successUrl.trim()) {
        payload.successUrl = settings.successUrl.trim();
      }

      const response = await fetch(`${apiBase}/store/checkout/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text();
      let body: unknown = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        body = null;
      }
      const bodyRecord = (body ?? {}) as {
        message?: string | string[];
      };
      if (!response.ok) {
        const message = Array.isArray(bodyRecord.message)
          ? bodyRecord.message.join("; ")
          : bodyRecord.message;
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      const sessionResponse = body as CheckoutSessionResponse;
      setCheckoutSession(sessionResponse);

      try {
        window.localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(sessionResponse),
        );
      } catch {
        // Storage can be unavailable (private mode); polling still works in-tab.
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create checkout session",
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

  async function fetchCheckoutSession(sessionId: string) {
    try {
      const response = await fetch(
        `${apiBase}/store/checkout/sessions/${encodeURIComponent(sessionId)}`,
      );
      const bodyText = await response.text();
      const body = bodyText ? JSON.parse(bodyText) : null;
      if (!response.ok) {
        throw new Error(
          body?.message ?? `Session lookup failed (${response.status})`,
        );
      }
      const sessionResponse = body as CheckoutSessionResponse;
      setCheckoutSession(sessionResponse);
      try {
        window.localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(sessionResponse),
        );
      } catch {
        // Ignore storage failures; polling continues in-tab.
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch checkout session status",
      );
    }
  }

  async function cancelCheckoutSession() {
    if (!checkoutSession?.sessionId) {
      return;
    }

    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/store/checkout/sessions/${encodeURIComponent(
          checkoutSession.sessionId,
        )}/cancel`,
        { method: "POST" },
      );
      const bodyText = await response.text();
      const body = bodyText ? JSON.parse(bodyText) : null;
      if (!response.ok && body?.message?.length) {
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join("; ")
            : String(body.message),
        );
      }
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      if (body?.sessionId) {
        setCheckoutSession(body as CheckoutSessionResponse);
      }
      setFrameSignal(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to cancel checkout session",
      );
    } finally {
      setCancelling(false);
    }
  }

  function openCheckoutPage(checkoutUrl: string) {
    window.location.href = checkoutUrl;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.checkoutToken, canPoll]);

  useEffect(() => {
    if (!settings.useCheckoutPage || !checkoutSession?.sessionId) {
      return;
    }

    void fetchCheckoutSession(checkoutSession.sessionId);
    if (isCheckoutTerminal) {
      return;
    }

    const pollInterval = window.setInterval(() => {
      void fetchCheckoutSession(
        checkoutSession.sessionId,
      );
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.useCheckoutPage, checkoutSession?.sessionId, isCheckoutTerminal]);

  useEffect(() => {
    if (!settings.useCheckoutPage || !checkoutSession?.checkoutUrl) {
      return;
    }

    let allowedOrigin: string;
    try {
      allowedOrigin = new URL(checkoutSession.checkoutUrl).origin;
    } catch {
      return;
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== allowedOrigin) {
        return;
      }
      if (
        frameRef.current &&
        event.source &&
        event.source !== frameRef.current.contentWindow
      ) {
        return;
      }

      const data = event.data as CheckoutPageMessage | null;
      if (!data || typeof data !== "object" || typeof data.type !== "string") {
        return;
      }

      if (data.type === "PAYMENT_SUCCESS") {
        setFrameSignal("PAYMENT_SUCCESS");
        return;
      }
      if (data.type === "SESSION_EXPIRED") {
        setFrameSignal("SESSION_EXPIRED");
        return;
      }
      if (data.type === "SCANNED") {
        setFrameSignal("SCANNED");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [settings.useCheckoutPage, checkoutSession?.checkoutUrl]);

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

        <section className="card">
          <h2>Settings</h2>
          <p className="muted">
            Checkout settings are stored in this browser only. Status is always
            confirmed server-side before display.
          </p>

          <div className="setting-row">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.useCheckoutPage}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    useCheckoutPage: event.target.checked,
                  })
                }
              />
              <span
                className="switch-track"
                role="presentation"
              >
                <span className="switch-knob" />
              </span>
            </label>
            <div>
              <strong>Use Bakong checkout page</strong>
              <p className="muted">
                When enabled, checkout is hosted by the Bakong checkout page
                (iframe embed or full-page redirect). The merchant backend
                mints the session and confirms it with a long-poll waiter —
                requires BAKONG_MERCHANT_TOKEN server-side.
              </p>
            </div>
          </div>

          {settings.useCheckoutPage ? (
            <div className="form" style={{ marginTop: 14 }}>
              <label>
                Presentation
                <select
                  value={settings.mode}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      mode: event.target.value as CheckoutPageMode,
                    })
                  }
                >
                  <option value="iframe">
                    Embedded iframe (postMessage)
                  </option>
                  <option value="redirect">
                    Full-page redirect (success URL)
                  </option>
                </select>
              </label>

              <label>
                Currency
                <select
                  value={settings.currency}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      currency: event.target.value === "USD" ? "USD" : "KHR",
                    })
                  }
                >
                  <option value="KHR">KHR</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              <label>
                Session expiry seconds (60–600)
                <input
                  type="number"
                  min={60}
                  max={600}
                  step={1}
                  value={settings.expirySeconds}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      expirySeconds: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label>
                Success URL (optional, HTTPS on a verified domain)
                <input
                  type="text"
                  value={settings.successUrl}
                  placeholder="Server default (CHECKOUT_SUCCESS_URL) — supports {BILL_NO}"
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      successUrl: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          ) : null}
        </section>

        <section className="grid">
          <article className="card">
            <h2>Create Checkout Intent</h2>
            {settings.useCheckoutPage ? (
              <p className="muted">
                The merchant backend mints a Bakong checkout session and hands
                back a hosted checkout page URL.
              </p>
            ) : (
              <p className="muted">
                This generates a Bakong KHQR locally. Payment status updates
                arrive through signed webhooks.
              </p>
            )}

            <div className="form">
              <label>
                Amount {settings.useCheckoutPage && settings.currency === "KHR"  ? " (whole number)" : ""}
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
                {settings.useCheckoutPage ? "Bill Number" : "Merchant Order ID"}
                <input
                  type="text"
                  value={merchantOrderId}
                  onChange={(event) => setMerchantOrderId(event.target.value)}
                />
              </label>

              {!settings.useCheckoutPage ? (
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
              ) : null}

              <button
                type="button"
                onClick={function () {
                  if (settings.useCheckoutPage) {
                    void createCheckoutSession();
                  } else {
                    void createIntent();
                  }
                }}
                disabled={loading}
              >
                {loading
                  ? settings.useCheckoutPage
                    ? "Creating session..."
                    : "Creating intent..."
                  : settings.useCheckoutPage
                    ? "Create Checkout Session"
                    : "Create KHQR Intent"}
              </button>
            </div>
          </article>

          {settings.useCheckoutPage ? (
            <article className="card panel-list">
              <h2>Bakong Checkout Session</h2>
              {!checkoutSession ? (
                <p className="muted">Create a checkout session first.</p>
              ) : (
                <>
                  <div>
                    <span
                      className={`status-chip status-${checkoutStatus ?? "PENDING"}`}
                    >
                      {getCheckoutStatusLabel(checkoutStatus)}
                    </span>
                    {redirectNotice ? (
                      <p className="banner" style={{ marginTop: 8 }}>
                        Checkout page returned with status={redirectNotice.status}
                        {redirectNotice.bill ? ` for bill ${redirectNotice.bill}` : ""}
                        . Confirmation stays with the merchant backend.
                      </p>
                    ) : null}
                    {frameSignal ? (
                      <p className="banner" style={{ marginTop: 8 }}>
                        Browser signal: {frameSignal} — confirming with the
                        merchant backend before fulfilment.
                      </p>
                    ) : null}
                    {isCheckoutTerminal && checkoutStatus !== "SUCCESS" ? (
                      <p className="muted" style={{ marginTop: 8 }}>
                        Session ended: {checkoutStatus}. Offer a new checkout.
                      </p>
                    ) : null}
                  </div>

                  <div className="inline-pairs">
                    <div className="inline-pair">
                      <span>Session ID</span>
                      <strong
                        style={{ wordBreak: "break-all", maxWidth: "60%" }}
                      >
                        {checkoutSession.sessionId}
                      </strong>
                    </div>
                    <div className="inline-pair">
                      <span>Bill</span>
                      <strong>{checkoutSession.billNo}</strong>
                    </div>
                    <div className="inline-pair">
                      <span>Amount</span>
                      <strong>
                        {checkoutSession.amount} {checkoutSession.currency}
                      </strong>
                    </div>
                    <div className="inline-pair">
                      <span>Expires</span>
                      <strong>{formatEpochSeconds(checkoutSession.expiry)}</strong>
                    </div>
                    {checkoutSession.updatedAt ? (
                      <div className="inline-pair">
                        <span>Last Status Update</span>
                        <strong>
                          {new Date(checkoutSession.updatedAt).toLocaleString()}
                        </strong>
                      </div>
                    ) : null}
                  </div>

                  {settings.mode === "iframe" ? (
                    <iframe
                      ref={frameRef}
                      src={checkoutSession.checkoutUrl}
                      title="Bakong checkout"
                      allow="clipboard-write"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      className="checkout-frame"
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openCheckoutPage(checkoutSession.checkoutUrl)}
                        disabled={isCheckoutTerminal}
                      >
                        Open Checkout Page
                      </button>
                      {checkoutSession.successUrl ? (
                        <p className="muted" style={{ marginTop: 8 }}>
                          After payment the hosted page redirects to{" "}
                          {checkoutSession.successUrl}
                        </p>
                      ) : (
                        <p className="muted" style={{ marginTop: 8 }}>
                          No success URL configured — the hosted page returns to
                          the merchant origin.
                        </p>
                      )}
                    </>
                  )}

                  {!isCheckoutTerminal &&
                  (checkoutStatus === "PENDING" ||
                    checkoutStatus === "SCANNED") ? (
                    <button
                      type="button"
                      onClick={() => void cancelCheckoutSession()}
                      disabled={cancelling}
                      style={{ background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" }}
                    >
                      {cancelling ? "Cancelling..." : "Cancel Session"}
                    </button>
                  ) : null}

                  <details>
                    <summary>Show raw payloads</summary>
                    <div className="payload" style={{ marginTop: 10 }}>
                      {JSON.stringify({ checkoutSession }, null, 2)}
                    </div>
                  </details>
                </>
              )}
            </article>
          ) : (
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
          )}
        </section>

        {!settings.useCheckoutPage ? (
          <section className="card">
            <h2>Webhook Inbox (Mock Merchant Backend)</h2>
            <p className="muted">
              This shows recent webhook deliveries received at{" "}
              <strong>/store/webhooks/payment-updates</strong>. Matching
              deliveries update the checkout status above.
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
        ) : null}
      </div>
    </main>
  );
}
