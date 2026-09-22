import { createHash, createHmac, randomUUID } from "node:crypto";

import { ApiError } from "./http";
import type { CreateCheckoutIntentInput } from "./validation";

export interface OpenBankingCheckoutIntent {
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
}

interface CheckoutConfig {
    baseUrl: string;
    merchantId: string;
    apiSigningSecret: string;
    webhookSigningSecret: string;
    defaultCurrency: string;
    defaultExpiresInMinutes: number;
}

interface CreateIntentRequestBody {
    amount: number;
    currency: string;
    description: string;
    expiresInMinutes: number;
    merchantOrderId: string;
}

interface SendCreateIntentResult {
    response: Response;
    parsed: unknown;
    ok: boolean;
}

const CREATE_INTENT_PATH = "/api/checkout/intents";

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

function loadConfig(): CheckoutConfig {
    return {
        baseUrl:
            firstNonEmpty(process.env.OPEN_BANKING_BASE_URL) ||
            "http://localhost:8080",
        merchantId: firstNonEmpty(process.env.MERCHANT_ID),
        apiSigningSecret: firstNonEmpty(process.env.MERCHANT_API_SIGNING_SECRET),
        webhookSigningSecret: firstNonEmpty(
            process.env.MERCHANT_WEBHOOK_SIGNING_SECRET,
        ),
        defaultCurrency: firstNonEmpty(process.env.DEFAULT_CURRENCY) || "KHR",
        defaultExpiresInMinutes: Number(
            firstNonEmpty(process.env.DEFAULT_EXPIRES_IN_MINUTES) || "15",
        ),
    };
}

function signingSecretCandidates(config: CheckoutConfig): string[] {
    const candidates: string[] = [];
    if (config.apiSigningSecret) {
        candidates.push(config.apiSigningSecret);
    }
    if (
        config.webhookSigningSecret &&
        config.webhookSigningSecret !== config.apiSigningSecret
    ) {
        candidates.push(config.webhookSigningSecret);
    }
    return candidates;
}

function assertConfig(config: CheckoutConfig): void {
    if (!config.merchantId) {
        throw new ApiError(500, {
            statusCode: 500,
            message: "MERCHANT_ID is not configured",
            error: "Internal Server Error",
        });
    }

    if (signingSecretCandidates(config).length === 0) {
        throw new ApiError(500, {
            statusCode: 500,
            message:
                "MERCHANT_API_SIGNING_SECRET or MERCHANT_WEBHOOK_SIGNING_SECRET is not configured",
            error: "Internal Server Error",
        });
    }
}

function buildRequestFingerprint(body: CreateIntentRequestBody): string {
    const value = [
        Number(body.amount).toString(),
        body.currency.trim().toUpperCase(),
        body.description.trim(),
        String(body.expiresInMinutes),
        body.merchantOrderId.trim(),
    ].join("|");

    return createHash("sha256").update(value, "utf8").digest("hex");
}

async function sendCreateIntentRequest(
    config: CheckoutConfig,
    body: CreateIntentRequestBody,
    signingSecret: string,
    idempotencyKey: string,
    requestFingerprint: string,
): Promise<SendCreateIntentResult> {
    const timestamp = Date.now();
    const nonce = randomUUID();

    const canonical = [
        "POST",
        CREATE_INTENT_PATH,
        config.merchantId,
        String(timestamp),
        nonce,
        idempotencyKey,
        requestFingerprint,
    ].join("\n");

    const signature = createHmac("sha256", signingSecret)
        .update(canonical, "utf8")
        .digest("hex");

    const response = await fetch(`${config.baseUrl}${CREATE_INTENT_PATH}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Merchant-Id": config.merchantId,
            "X-Timestamp": String(timestamp),
            "X-Nonce": nonce,
            "Idempotency-Key": idempotencyKey,
            "X-Signature": signature,
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    const responseText = await response.text();
    let parsed: unknown = null;
    try {
        parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
        parsed = { message: responseText };
    }

    return { response, parsed, ok: response.ok };
}

function extractErrorMessage(parsed: unknown, status: number): string {
    if (typeof parsed === "object" && parsed && "message" in parsed) {
        return String((parsed as { message?: unknown }).message);
    }

    return `Open banking create intent failed with status ${status}`;
}

/**
 * Creates a checkout intent by signing and forwarding the request to the
 * Open Banking backend (port of the previous NestJS `CheckoutService`).
 */
export async function createCheckoutIntent(
    payload: CreateCheckoutIntentInput,
): Promise<OpenBankingCheckoutIntent> {
    const config = loadConfig();
    assertConfig(config);

    const body: CreateIntentRequestBody = {
        amount: payload.amount,
        currency: payload.currency ?? config.defaultCurrency,
        description: payload.description ?? "Mock store checkout",
        expiresInMinutes: payload.expiresInMinutes ?? config.defaultExpiresInMinutes,
        merchantOrderId: payload.merchantOrderId ?? `MOCK-${Date.now()}`,
    };

    const idempotencyKey = `mock-${body.merchantOrderId}-create-intent`;
    const requestFingerprint = buildRequestFingerprint(body);

    let lastError: ApiError | null = null;
    const signingSecrets = signingSecretCandidates(config);

    for (let index = 0; index < signingSecrets.length; index += 1) {
        const secret = signingSecrets[index];
        const result = await sendCreateIntentRequest(
            config,
            body,
            secret,
            idempotencyKey,
            requestFingerprint,
        );

        if (result.ok) {
            if (index > 0) {
                console.warn(
                    "Primary API signing secret failed; create-intent succeeded with fallback secret. Sync MERCHANT_API_SIGNING_SECRET.",
                );
            }
            return result.parsed as OpenBankingCheckoutIntent;
        }

        const message = extractErrorMessage(result.parsed, result.response.status);
        const shouldRetryWithNextSecret =
            index < signingSecrets.length - 1 &&
            result.response.status === 401 &&
            message === "Invalid request signature";

        if (shouldRetryWithNextSecret) {
            continue;
        }

        lastError = new ApiError(
            result.response.status >= 400 && result.response.status < 500
                ? result.response.status
                : 502,
            {
                message,
                upstreamStatus: result.response.status,
                upstreamBody: result.parsed,
            },
        );
        break;
    }

    if (lastError) {
        throw lastError;
    }

    throw new ApiError(502, {
        statusCode: 502,
        message: "Open banking create intent failed",
        error: "Bad Gateway",
    });
}

/**
 * Proxies a checkout status lookup to the Open Banking backend.
 */
export async function getCheckoutStatus(
    checkoutToken: string,
): Promise<unknown> {
    const config = loadConfig();

    const response = await fetch(
        `${config.baseUrl}/api/checkout/status/${encodeURIComponent(checkoutToken)}`,
        {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
        },
    );

    const text = await response.text();
    let parsed: unknown = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = { message: text };
    }

    if (!response.ok) {
        throw new ApiError(
            response.status >= 400 && response.status < 500 ? response.status : 502,
            {
                message: "Open banking checkout status lookup failed",
                upstreamStatus: response.status,
                upstreamBody: parsed,
            },
        );
    }

    return parsed;
}
