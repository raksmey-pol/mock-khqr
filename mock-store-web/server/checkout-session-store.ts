import {
    isTerminalCheckoutSessionStatus,
    type CheckoutSessionData,
} from "./checkout-api";

export interface CheckoutSessionRecord {
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
    idempotencyKey: string | null;
    createdAt: string;
    updatedAt: string;
}

const MAX_SESSIONS = 200;
const GLOBAL_STORE_KEY = "__mockStoreCheckoutSessionStore__";

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
    "CREATED",
    "PENDING",
    "SCANNED",
    "SUCCESS",
    "FAILED",
    "TIMEOUT",
    "EXPIRED",
    "CANCELLED",
]);

const NON_TERMINAL_RANK: ReadonlyMap<string, number> = new Map([
    ["CREATED", 0],
    ["PENDING", 0],
    ["SCANNED", 1],
]);

function getSessionStore(): Map<string, CheckoutSessionRecord> {
    const globalObject = globalThis as typeof globalThis & {
        [GLOBAL_STORE_KEY]?: Map<string, CheckoutSessionRecord>;
    };

    if (!globalObject[GLOBAL_STORE_KEY]) {
        globalObject[GLOBAL_STORE_KEY] = new Map<
            string,
            CheckoutSessionRecord
        >();
    }

    return globalObject[GLOBAL_STORE_KEY] as Map<
        string,
        CheckoutSessionRecord
    >;
}

export function saveCheckoutSession(record: CheckoutSessionRecord): void {
    const store = getSessionStore();
    store.delete(record.sessionId);
    store.set(record.sessionId, record);

    while (store.size > MAX_SESSIONS) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        store.delete(oldestKey);
    }
}

export function getCheckoutSessionRecord(
    sessionId: string,
): CheckoutSessionRecord | null {
    return getSessionStore().get(sessionId) ?? null;
}

export function listCheckoutSessionRecords(): CheckoutSessionRecord[] {
    return Array.from(getSessionStore().values()).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
}

export function findActiveCheckoutSessionByBillNo(
    billNo: string,
): CheckoutSessionRecord | null {
    for (const record of getSessionStore().values()) {
        if (record.billNo === billNo && !isTerminalCheckoutSessionStatus(record.status)) {
            return record;
        }
    }
    return null;
}

export function normalizeCheckoutStatus(value: unknown): string {
    const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (KNOWN_STATUSES.has(raw)) {
        return raw;
    }
    return raw.length > 0 ? raw : "PENDING";
}

function epochSecondsToIso(value: unknown): string | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return null;
    }
    return new Date(value * 1000).toISOString();
}

function isTruthyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function upsertCheckoutSessionFromRemote(
    data: CheckoutSessionData,
    extras: {
        idempotencyKey: string | null;
        description: string | null;
        successUrl: string | null;
    },
): CheckoutSessionRecord {
    const existing = getCheckoutSessionRecord(data.session_id);

    if (existing) {
        const updated = mergeRemoteIntoRecord(existing, data, extras, true);
        saveCheckoutSession(updated);
        return updated;
    }

    const now = new Date().toISOString();
    const record: CheckoutSessionRecord = {
        sessionId: data.session_id,
        checkoutUrl: isTruthyString(data.checkout_url) ? data.checkout_url : "",
        md5: isTruthyString(data.md5) ? data.md5 : null,
        billNo: isTruthyString(data.billNo)
            ? data.billNo
            : `UNKNOWN-${data.session_id.slice(0, 8)}`,
        amount: typeof data.amount === "number" ? data.amount : 0,
        currency: isTruthyString(data.currency) ? data.currency.toUpperCase() : "",
        status: normalizeCheckoutStatus(data.status),
        paymentAt: epochSecondsToIso(data.payment_at),
        expiry: typeof data.expiry === "number" ? data.expiry : null,
        description: extras.description,
        successUrl: extras.successUrl,
        idempotencyKey: extras.idempotencyKey,
        createdAt:
            epochSecondsToIso(data.created_at) ??
            epochSecondsToIso(data.updated_at) ??
            now,
        updatedAt: now,
    };

    saveCheckoutSession(record);
    return record;
}

function mergeRemoteIntoRecord(
    record: CheckoutSessionRecord,
    data: CheckoutSessionData,
    extras: {
        idempotencyKey: string | null;
        description: string | null;
        successUrl: string | null;
    },
    allowCreateFields: boolean,
): CheckoutSessionRecord {
    const updated: CheckoutSessionRecord = { ...record };

    if (allowCreateFields) {
        if (isTruthyString(data.checkout_url)) {
            updated.checkoutUrl = data.checkout_url;
        }
        if (isTruthyString(data.md5)) {
            updated.md5 = data.md5;
        }
        if (isTruthyString(data.billNo)) {
            updated.billNo = data.billNo;
        }
        if (typeof data.amount === "number") {
            updated.amount = data.amount;
        }
        if (isTruthyString(data.currency)) {
            updated.currency = data.currency.toUpperCase();
        }
        if (typeof data.expiry === "number") {
            updated.expiry = data.expiry;
        }
        updated.description = updated.description ?? extras.description;
        updated.successUrl = updated.successUrl ?? extras.successUrl;
        updated.idempotencyKey = updated.idempotencyKey ?? extras.idempotencyKey;
    }

    if (data.payment_at !== undefined) {
        updated.paymentAt = epochSecondsToIso(data.payment_at) ?? updated.paymentAt;
    }

    updated.status = normalizeCheckoutStatus(data.status);
    return updated;
}

/**
 * Applies a terminal-observed remote status to the locally tracked session.
 *
 * Enforces the merchant rules from the Bakong checkout guide:
 * - amount / currency / billNo are verified before writing;
 * - terminal statuses are immutable (a local terminal state is never moved
 *   back to PENDING/SCANNED);
 * - a settlement observed after EXPIRED is logged as reversal evidence and the
 *   session stays EXPIRED;
 * - forward-only progression while non-terminal (CREATED/PENDING -> SCANNED).
 */
export function applyRemoteCheckoutSessionUpdate(
    sessionId: string,
    data: CheckoutSessionData,
): CheckoutSessionRecord | null {
    const record = getCheckoutSessionRecord(sessionId);
    if (!record) {
        return null;
    }

    const remoteStatus = normalizeCheckoutStatus(data.status);

    const mismatch = [];
    if (typeof data.amount === "number" && data.amount !== record.amount) {
        mismatch.push(`amount (${data.amount} vs ${record.amount})`);
    }
    if (
        isTruthyString(data.currency) &&
        data.currency.toUpperCase() !== record.currency
    ) {
        mismatch.push(`currency (${data.currency} vs ${record.currency})`);
    }
    if (isTruthyString(data.billNo) && data.billNo !== record.billNo) {
        mismatch.push(`billNo (${data.billNo} vs ${record.billNo})`);
    }

    if (mismatch.length > 0) {
        console.error(
            `[mock-store] checkout session field mismatch for ${sessionId}: ${mismatch.join(", ")} — remote status NOT applied (no fulfilment)`,
        );
        return null;
    }

    const localIsTerminal = isTerminalCheckoutSessionStatus(record.status);
    if (localIsTerminal) {
        if (remoteStatus === "SUCCESS" && record.status !== "SUCCESS") {
            console.warn(
                `[mock-store] reversal evidence: settlement for ${sessionId} arrived after ${record.status} — session stays ${record.status}`,
            );
        }
        if (record.status !== remoteStatus) {
            console.log(
                `[mock-store] checkout session ${sessionId} stays ${record.status} (remote said ${remoteStatus})`,
            );
        }
        return null;
    }

    const localRank = NON_TERMINAL_RANK.get(record.status) ?? 0;
    const remoteRank = NON_TERMINAL_RANK.get(remoteStatus) ?? 0;

    if (!isTerminalCheckoutSessionStatus(remoteStatus) && remoteRank <= localRank) {
        return null;
    }

    const updated = mergeRemoteIntoRecord(
        record,
        { ...data, status: remoteStatus },
        { idempotencyKey: null, description: null, successUrl: null },
        false,
    );
    updated.updatedAt = new Date().toISOString();
    saveCheckoutSession(updated);

    console.log(
        `[mock-store] checkout session ${sessionId} status ${record.status} -> ${updated.status}`,
    );

    return updated;
}

/**
 * Marks a locally tracked session EXPIRED once its expiry window passed (with
 * a small grace period to tolerate clock skew). Remote terminal states still
 * take precedence via `applyRemoteCheckoutSessionUpdate`.
 */
export function expireCheckoutSessionIfNeeded(
    record: CheckoutSessionRecord,
    graceSeconds = 60,
): CheckoutSessionRecord {
    if (isTerminalCheckoutSessionStatus(record.status)) {
        return record;
    }

    if (typeof record.expiry !== "number" || record.expiry <= 0) {
        return record;
    }

    if (Date.now() > (record.expiry + graceSeconds) * 1000) {
        const updated: CheckoutSessionRecord = {
            ...record,
            status: "EXPIRED",
            updatedAt: new Date().toISOString(),
        };
        saveCheckoutSession(updated);
        console.log(
            `[mock-store] checkout session ${record.sessionId} locally expired`,
        );
        return updated;
    }

    return record;
}
