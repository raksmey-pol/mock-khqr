import { randomUUID } from "node:crypto";

import { ApiError } from "./http";
import {
    expireIfNeeded,
    getCheckoutIntent,
    saveCheckoutIntent,
    type CheckoutIntentRecord,
} from "./intent-store";
import { generateCheckoutKhqr } from "./khqr";
import type { CreateCheckoutIntentInput } from "./validation";

const MAX_BILL_NUMBER_LENGTH = 25;

function firstNonEmpty(...values: Array<string | undefined>): string {
    for (const value of values) {
        if (typeof value !== "string") {
            continue;
        }

        const trimmed = value.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return "";
}

function resolveDefaultCurrency(): string {
    return (firstNonEmpty(process.env.DEFAULT_CURRENCY) || "KHR").toUpperCase();
}

function resolveDefaultExpiresInMinutes(): number {
    const parsed = Number(firstNonEmpty(process.env.DEFAULT_EXPIRES_IN_MINUTES));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

function buildPaymentRef(): string {
    const suffix = randomUUID()
        .replace(/[^0-9a-f]/gi, "")
        .slice(0, 6)
        .toUpperCase();
    return `MOCK-${Date.now()}-${suffix}`;
}

/**
 * Creates a checkout intent by generating a Bakong KHQR locally — no
 * upstream call. Payment status is updated later by signed webhook
 * deliveries (see `applyWebhookStatusUpdate`).
 */
export async function createCheckoutIntent(
    payload: CreateCheckoutIntentInput,
): Promise<CheckoutIntentRecord> {
    const currency = (payload.currency ?? resolveDefaultCurrency()).toUpperCase();
    const expiresInMinutes =
        payload.expiresInMinutes ?? resolveDefaultExpiresInMinutes();
    const merchantOrderId = payload.merchantOrderId ?? `MOCK-${Date.now()}`;

    const expiresAt = new Date(
        Date.now() + expiresInMinutes * 60 * 1000,
    ).toISOString();

    const { qr, md5 } = generateCheckoutKhqr({
        amount: payload.amount,
        currency,
        expiresInMinutes,
        billNumber:
            merchantOrderId.length <= MAX_BILL_NUMBER_LENGTH
                ? merchantOrderId
                : undefined,
    });

    const now = new Date().toISOString();
    const intent: CheckoutIntentRecord = {
        paymentId: randomUUID(),
        paymentRef: buildPaymentRef(),
        status: "PENDING",
        amount: payload.amount,
        currency,
        qrPayload: qr,
        khqrMd5: md5,
        paymentExpiresAt: expiresAt,
        checkoutToken: randomUUID(),
        checkoutTokenExpiresAt: expiresAt,
        merchantOrderId,
        createdAt: now,
        updatedAt: now,
    };

    saveCheckoutIntent(intent);

    console.log(
        `[mock-store] KHQR intent created ${intent.paymentRef} (${intent.currency} ${intent.amount}, expires ${intent.paymentExpiresAt})`,
    );

    return intent;
}

/**
 * Returns the locally tracked checkout status, marking the intent EXPIRED
 * once its payment window has passed.
 */
export function getCheckoutStatus(checkoutToken: string): CheckoutIntentRecord {
    const intent = getCheckoutIntent(checkoutToken);
    if (!intent) {
        throw new ApiError(404, {
            statusCode: 404,
            message: "Checkout intent not found",
            error: "Not Found",
        });
    }

    return expireIfNeeded(intent);
}
