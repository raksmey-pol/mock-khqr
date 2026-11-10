import { randomUUID } from "node:crypto";

import {
    cancelCheckoutSessionOnOpenApi,
    createCheckoutSessionOnOpenApi,
    getCheckoutSessionFromOpenApi,
    isTerminalCheckoutSessionStatus,
    CHECKOUT_WAIT_WINDOW_MAX_SECONDS,
    type CheckoutSessionData,
} from "./checkout-api";
import {
    requireCheckoutOpenApiConfig,
    resolveCheckoutSuccessUrlDefault,
    resolveDefaultCheckoutExpirySeconds,
} from "./checkout-config";
import { ApiError } from "./http";
import {
    applyRemoteCheckoutSessionUpdate,
    expireCheckoutSessionIfNeeded,
    getCheckoutSessionRecord,
    listCheckoutSessionRecords,
    upsertCheckoutSessionFromRemote,
    type CheckoutSessionRecord,
} from "./checkout-session-store";
import type { CreateCheckoutSessionInput } from "./validation";

const WAITER_REARM_BASE_MS = 250;
const WAITER_REARM_JITTER_MS = 500;
const WAITER_ERROR_BACKOFF_MS = 1500;
const GLOBAL_WAITER_KEY = "__mockStoreCheckoutSessionWaiters__";

export const LOCAL_EXPIRY_GRACE_SECONDS = 60;

function getActiveWaiters(): Set<string> {
    const globalObject = globalThis as typeof globalThis & {
        [GLOBAL_WAITER_KEY]?: Set<string>;
    };

    if (!globalObject[GLOBAL_WAITER_KEY]) {
        globalObject[GLOBAL_WAITER_KEY] = new Set<string>();
    }

    return globalObject[GLOBAL_WAITER_KEY] as Set<string>;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createCheckoutSession(
    payload: CreateCheckoutSessionInput,
): Promise<CheckoutSessionRecord> {
    requireCheckoutOpenApiConfig();

    const idempotencyKey = randomUUID();
    const successUrl =
        payload.successUrl ?? resolveCheckoutSuccessUrlDefault() ?? undefined;
    const expirySeconds =
        payload.expirySeconds ?? resolveDefaultCheckoutExpirySeconds() ?? undefined;

    const data = await createCheckoutSessionOnOpenApi(
        {
            amount: payload.amount,
            currency: payload.currency,
            billNo: payload.billNo,
            successUrl,
            expirySeconds,
            description: payload.description,
        },
        idempotencyKey,
    );

    const record = upsertCheckoutSessionFromRemote(data, {
        idempotencyKey,
        description: payload.description ?? null,
        successUrl: successUrl ?? null,
    });

    console.log(
        `[mock-store] checkout session minted ${record.sessionId} (bill ${record.billNo}, ${record.currency} ${record.amount}, expires ${record.expiry})`,
    );

    startCheckoutSessionWaiter(record.sessionId);

    return record;
}

export function getCheckoutSessionStatus(
    sessionId: string,
): CheckoutSessionRecord {
    const record = getCheckoutSessionRecord(sessionId);
    if (!record) {
        throw new ApiError(404, {
            statusCode: 404,
            message: "Checkout session not found",
            error: "Not Found",
        });
    }

    return expireCheckoutSessionIfNeeded(
        record,
        LOCAL_EXPIRY_GRACE_SECONDS,
    );
}

export function listCheckoutSessions(): CheckoutSessionRecord[] {
    return listCheckoutSessionRecords().map((record) =>
        isTerminalCheckoutSessionStatus(record.status)
            ? record
            : expireCheckoutSessionIfNeeded(
                record,
                LOCAL_EXPIRY_GRACE_SECONDS,
            ),
    );
}

export async function cancelCheckoutSession(
    sessionId: string,
): Promise<CheckoutSessionRecord> {
    const record = getCheckoutSessionRecord(sessionId);
    if (!record) {
        throw new ApiError(404, {
            statusCode: 404,
            message: "Checkout session not found",
            error: "Not Found",
        });
    }

    if (isTerminalCheckoutSessionStatus(record.status)) {
        throw new ApiError(409, {
            statusCode: 409,
            message: `Session is already ${record.status}`,
            error: "Conflict",
        });
    }

    try {
        const data = await cancelCheckoutSessionOnOpenApi(sessionId);
        applyRemoteCheckoutSessionUpdate(sessionId, data);
    } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
            throw new ApiError(409, {
                statusCode: 409,
                message: "Session is already terminal",
                error: "Conflict",
            });
        }
        throw error;
    }

    return getCheckoutSessionRecord(sessionId) ?? record;
}

export function startCheckoutSessionWaiter(sessionId: string): void {
    const active = getActiveWaiters();
    if (active.has(sessionId)) {
        return;
    }

    active.add(sessionId);
    void runWaiterLoop(sessionId).finally(() => active.delete(sessionId));
}

async function runWaiterLoop(sessionId: string): Promise<void> {
    for (;;) {
        const record = getCheckoutSessionRecord(sessionId);
        if (!record || isTerminalCheckoutSessionStatus(record.status)) {
            return;
        }

        let data: CheckoutSessionData | null = null;
        try {
            data = await getCheckoutSessionFromOpenApi(sessionId, {
                wait: true,
                windowSeconds: CHECKOUT_WAIT_WINDOW_MAX_SECONDS,
            });
        } catch (error) {
            console.error(
                `[mock-store] checkout session waiter error (${sessionId}):`,
                error,
            );
        }

        if (!data) {
            await delay(
                WAITER_ERROR_BACKOFF_MS +
                    Math.floor(Math.random() * WAITER_REARM_JITTER_MS),
            );
            continue;
        }

        applyRemoteCheckoutSessionUpdate(sessionId, data);

        if (isTerminalCheckoutSessionStatus(data.status)) {
            return;
        }

        await delay(
            WAITER_REARM_BASE_MS +
                Math.floor(Math.random() * WAITER_REARM_JITTER_MS),
        );
    }
}
