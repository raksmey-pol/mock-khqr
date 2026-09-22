import { createHmac, timingSafeEqual } from "node:crypto";

import { ApiError } from "./http";
import { applyWebhookStatusUpdate } from "./intent-store";
import { addWebhookEvent } from "./webhook-store";

export interface WebhookProcessingResult {
    matchedIntent: boolean;
    checkoutToken?: string;
    status?: string;
}

/**
 * Standard acknowledgement body for accepted webhook callbacks — mirrors the
 * Bakong Open API `status` envelope (`code: 0` = success).
 */
export function buildWebhookAcknowledgement(): Record<string, unknown> {
    return {
        status: {
            code: 0,
            errorCode: null,
            error: null,
            message: null,
            warning: null,
        },
    };
}

function isWebhookSignatureRequired(): boolean {
    const raw = (process.env.WEBHOOK_REQUIRE_SIGNATURE ?? "")
        .trim()
        .toLowerCase();
    return !["false", "0", "no", "off"].includes(raw);
}

/**
 * Processes a `payment.status_changed` webhook: optionally verifies the HMAC
 * signature, records the delivery in the in-memory inbox, and applies the
 * status to the matching checkout intent.
 *
 * `WEBHOOK_REQUIRE_SIGNATURE=false` makes the signature optional (handy for
 * manual curl tests); when signature headers are present they are still
 * verified. Defaults to `true`.
 */
export async function handlePaymentUpdateWebhook(
    request: Request,
): Promise<WebhookProcessingResult> {
    const secret = (process.env.MERCHANT_WEBHOOK_SIGNING_SECRET ?? "").trim();
    const requireSignature = isWebhookSignatureRequired();

    const timestamp = request.headers.get("x-webhook-timestamp");
    const signature = request.headers.get("x-webhook-signature");
    const deliveryId = request.headers.get("x-webhook-delivery-id");
    const hasSignatureHeaders = Boolean(timestamp && signature);

    if (requireSignature) {
        if (secret.length === 0) {
            throw new ApiError(500, {
                statusCode: 500,
                message: "MERCHANT_WEBHOOK_SIGNING_SECRET is not configured",
                error: "Internal Server Error",
            });
        }

        if (!hasSignatureHeaders) {
            throw new ApiError(401, {
                statusCode: 401,
                message: "Missing webhook signature headers",
                error: "Unauthorized",
            });
        }
    } else if (!hasSignatureHeaders) {
        console.warn(
            "[mock-store] accepting unsigned webhook (WEBHOOK_REQUIRE_SIGNATURE=false)",
        );
    }

    const rawBody = await request.text();

    if (timestamp && signature) {
        if (secret.length === 0) {
            console.warn(
                "[mock-store] signature headers present but MERCHANT_WEBHOOK_SIGNING_SECRET is not configured; skipping verification",
            );
        } else {
            const canonical = `${timestamp}\n${rawBody}`;
            const expected = createHmac("sha256", secret)
                .update(canonical, "utf8")
                .digest("hex");

            const expectedBuffer = Buffer.from(expected, "hex");
            const providedBuffer = Buffer.from(signature.trim(), "hex");
            const isValid =
                expectedBuffer.length === providedBuffer.length &&
                timingSafeEqual(expectedBuffer, providedBuffer);

            if (!isValid) {
                throw new ApiError(401, {
                    statusCode: 401,
                    message: "Invalid webhook signature",
                    error: "Unauthorized",
                });
            }
        }
    }

    let payload: unknown = null;
    if (rawBody.trim().length > 0) {
        try {
            payload = JSON.parse(rawBody);
        } catch {
            payload = rawBody;
        }
    }

    addWebhookEvent({
        receivedAt: new Date().toISOString(),
        deliveryId: deliveryId ?? null,
        timestamp: timestamp ?? null,
        signature: signature ?? null,
        payload,
    });

    // Drive the checkout status from verified webhook deliveries.
    const statusUpdate = applyWebhookStatusUpdate(payload);

    console.log(
        `[mock-store] webhook processed (matchedIntent=${statusUpdate.matched}${statusUpdate.checkoutToken
            ? `, checkoutToken=${statusUpdate.checkoutToken}, status=${statusUpdate.status}`
            : ""
        })`,
    );

    return {
        matchedIntent: statusUpdate.matched,
        checkoutToken: statusUpdate.checkoutToken,
        status: statusUpdate.status,
    };
}
