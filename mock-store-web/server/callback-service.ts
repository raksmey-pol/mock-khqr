import { ApiError } from "./http";
import { applyQrCodeStatusUpdate } from "./intent-store";
import { addWebhookEvent } from "./webhook-store";

const BEARER_PREFIX = "Bearer ";

function unauthorized(message: string): ApiError {
    return new ApiError(401, {
        status: {
            code: 4,
            errorCode: 11,
            error: "Authentication error",
            message,
            warning: null,
        },
    });
}

/**
 * Handles the Soramitsu "Callback Transaction API"
 * (`POST {url}/api/v1/transactions/callback`): the callback service pushes
 * successful incoming payment transactions to the participant member, which
 * matches them to checkout intents by KHQR payload (`qrCode`).
 *
 * Authentication: when `CALLBACK_AUTH_TOKEN` is configured, the request must
 * carry `Authorization: Bearer <token>`; otherwise callbacks are accepted
 * without auth (testing mode).
 */
export async function handleTransactionCallback(
    request: Request,
): Promise<{ matched: number }> {
    const token = (process.env.CALLBACK_AUTH_TOKEN ?? "").trim();
    const authorization = request.headers.get("authorization") ?? "";

    if (token.length > 0) {
        const provided = authorization.startsWith(BEARER_PREFIX)
            ? authorization.slice(BEARER_PREFIX.length).trim()
            : "";

        if (provided.length === 0) {
            throw unauthorized("Token Blank");
        }
        if (provided !== token) {
            throw unauthorized("Incorrect Token");
        }
    } else if (authorization.length === 0) {
        console.warn(
            "[mock-store] accepting transaction callback without auth (CALLBACK_AUTH_TOKEN is not configured)",
        );
    }

    const rawBody = await request.text();
    let parsed: unknown = null;
    try {
        parsed = rawBody.trim().length > 0 ? JSON.parse(rawBody) : null;
    } catch {
        throw new ApiError(400, {
            statusCode: 400,
            message: "Invalid JSON payload",
            error: "Bad Request",
        });
    }

    const body = (parsed ?? {}) as {
        requestId?: unknown;
        transactions?: unknown;
    };
    const transactions = Array.isArray(body.transactions)
        ? (body.transactions as Array<Record<string, unknown>>)
        : [];

    let matched = 0;
    for (const transaction of transactions) {
        const qrCode =
            typeof transaction?.qrCode === "string" ? transaction.qrCode : "";
        const status =
            typeof transaction?.status === "string"
                ? transaction.status.toUpperCase()
                : "";

        if (!qrCode || status !== "SUCCESS") {
            continue;
        }

        if (applyQrCodeStatusUpdate(qrCode, "COMPLETED")) {
            matched += 1;
        }
    }

    addWebhookEvent({
        receivedAt: new Date().toISOString(),
        deliveryId: typeof body.requestId === "string" ? body.requestId : null,
        timestamp: null,
        signature: null,
        payload: parsed ?? rawBody,
    });

    console.log(
        `[mock-store] transaction callback processed (requestId=${
            typeof body.requestId === "string" ? body.requestId : "n/a"
        }, transactions=${transactions.length}, matched=${matched})`,
    );

    return { matched };
}
