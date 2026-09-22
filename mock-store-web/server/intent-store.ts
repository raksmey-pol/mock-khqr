export interface CheckoutIntentRecord {
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
    merchantOrderId: string;
    createdAt: string;
    updatedAt: string;
}

export interface WebhookStatusUpdateResult {
    matched: boolean;
    checkoutToken?: string;
    status?: string;
}

const MAX_INTENTS = 200;
const GLOBAL_STORE_KEY = "__mockStoreIntentStore__";

const FINAL_STATUSES = new Set([
    "COMPLETED",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
]);

const STATUS_ALIASES: Record<string, string> = {
    PENDING: "PENDING",
    UNPAID: "PENDING",
    PROCESSING: "PROCESSING",
    PAID: "COMPLETED",
    SUCCESS: "COMPLETED",
    SUCCEEDED: "COMPLETED",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    FAILURE: "FAILED",
    ERROR: "FAILED",
    EXPIRED: "EXPIRED",
    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",
};

/**
 * In-memory checkout intent store, keyed by `checkoutToken`.
 *
 * Held on `globalThis` so records survive module reloads during local
 * development. Like the previous NestJS service this is per-process state:
 * restarts clear it, and multiple instances each keep their own copy.
 */
function getIntentStore(): Map<string, CheckoutIntentRecord> {
    const globalObject = globalThis as typeof globalThis & {
        [GLOBAL_STORE_KEY]?: Map<string, CheckoutIntentRecord>;
    };

    if (!globalObject[GLOBAL_STORE_KEY]) {
        globalObject[GLOBAL_STORE_KEY] = new Map<
            string,
            CheckoutIntentRecord
        >();
    }

    return globalObject[GLOBAL_STORE_KEY] as Map<
        string,
        CheckoutIntentRecord
    >;
}

export function saveCheckoutIntent(intent: CheckoutIntentRecord): void {
    const store = getIntentStore();
    store.set(intent.checkoutToken, intent);

    // Drop the oldest records once the cap is exceeded.
    while (store.size > MAX_INTENTS) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        store.delete(oldestKey);
    }
}

export function getCheckoutIntent(
    checkoutToken: string,
): CheckoutIntentRecord | null {
    return getIntentStore().get(checkoutToken) ?? null;
}

function findIntent(
    predicate: (intent: CheckoutIntentRecord) => boolean,
): CheckoutIntentRecord | null {
    for (const intent of getIntentStore().values()) {
        if (predicate(intent)) {
            return intent;
        }
    }

    return null;
}

/**
 * Marks an intent as EXPIRED once its payment window has passed,
 * mirroring the status synchronization the Open Banking API performed.
 */
export function expireIfNeeded(
    intent: CheckoutIntentRecord,
): CheckoutIntentRecord {
    if (FINAL_STATUSES.has(intent.status)) {
        return intent;
    }

    const expiresAt = Date.parse(intent.paymentExpiresAt);
    if (!Number.isNaN(expiresAt) && Date.now() > expiresAt) {
        intent.status = "EXPIRED";
        intent.updatedAt = new Date().toISOString();
    }

    return intent;
}

function normalizeStatus(value: string): string {
    const key = value.trim().toUpperCase();
    return STATUS_ALIASES[key] ?? key;
}

function getString(
    fields: Record<string, unknown>,
    keys: string[],
): string | null {
    for (const key of keys) {
        const value = fields[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            return String(value);
        }
    }

    return null;
}

function parseDateOrNow(value: string | null): string {
    if (value) {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) {
            return new Date(parsed).toISOString();
        }
    }

    return new Date().toISOString();
}

function flattenWebhookPayload(
    payload: unknown,
): Record<string, unknown> | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return null;
    }

    const root = payload as Record<string, unknown>;
    const data = root.data;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        // Nested payloads are merged so either shape can be matched.
        return { ...root, ...(data as Record<string, unknown>) };
    }

    return root;
}

/**
 * Applies a (verified) webhook payload to the matching checkout intent.
 *
 * Matches, in order, by `checkoutToken`, `md5`/`khqrMd5`, `paymentId`, then
 * `paymentRef`/`billNumber` — see `docs/CHECKOUT_API_INTEGRATION.md` in the
 * Open Banking project for the canonical `payment.status_changed` payload.
 */
export function applyWebhookStatusUpdate(
    payload: unknown,
): WebhookStatusUpdateResult {
    const fields = flattenWebhookPayload(payload);
    if (!fields) {
        return { matched: false };
    }

    const checkoutToken = getString(fields, [
        "checkoutToken",
        "checkout_token",
    ]);
    const md5 = getString(fields, ["khqrMd5", "md5", "qrMd5", "qr_md5"]);
    const paymentId = getString(fields, ["paymentId", "payment_id"]);
    const paymentRef = getString(fields, [
        "paymentRef",
        "payment_ref",
        "billNumber",
    ]);

    const intent =
        (checkoutToken
            ? findIntent((item) => item.checkoutToken === checkoutToken)
            : null) ??
        (md5 ? findIntent((item) => item.khqrMd5 === md5) : null) ??
        (paymentId ? findIntent((item) => item.paymentId === paymentId) : null) ??
        (paymentRef
            ? findIntent(
                (item) =>
                    item.paymentRef === paymentRef ||
                    item.merchantOrderId === paymentRef,
            )
            : null);

    if (!intent) {
        return { matched: false };
    }

    const status = getString(fields, ["status", "paymentStatus", "newStatus"]);
    if (status) {
        intent.status = normalizeStatus(status);
    }

    intent.updatedAt = parseDateOrNow(
        getString(fields, ["updatedAt", "occurredAt"]),
    );

    const paymentExpiresAt = getString(fields, [
        "paymentExpiresAt",
        "checkoutTokenExpiresAt",
    ]);
    if (paymentExpiresAt && !Number.isNaN(Date.parse(paymentExpiresAt))) {
        const normalized = new Date(Date.parse(paymentExpiresAt)).toISOString();
        intent.paymentExpiresAt = normalized;
        intent.checkoutTokenExpiresAt = normalized;
    }

    return {
        matched: true,
        checkoutToken: intent.checkoutToken,
        status: intent.status,
    };
}
