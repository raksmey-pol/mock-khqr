import {
    requireCheckoutOpenApiConfig,
} from "./checkout-config";
import { ApiError } from "./http";

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_BASE_BACKOFF_MS = 750;
const RETRY_JITTER_MS = 250;
const MAX_ATTEMPTS = 3;
const DEFAULT_WAIT_WINDOW_SECONDS = 90;
const SUCCESS_CODES = new Set(["00", "0"]);

export const CHECKOUT_WAIT_WINDOW_MAX_SECONDS = 90;

export type CheckoutSessionStatus =
    | "CREATED"
    | "PENDING"
    | "SCANNED"
    | "SUCCESS"
    | "FAILED"
    | "TIMEOUT"
    | "EXPIRED"
    | "CANCELLED";

export const CHECKOUT_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
    "SUCCESS",
    "FAILED",
    "TIMEOUT",
    "EXPIRED",
    "CANCELLED",
]);

export function isTerminalCheckoutSessionStatus(status: unknown): boolean {
    return (
        typeof status === "string" &&
        CHECKOUT_TERMINAL_STATUSES.has(status.trim().toUpperCase())
    );
}

export interface CheckoutSessionData {
    session_id: string;
    checkout_url?: string;
    md5?: string;
    status: string;
    amount?: number;
    currency?: string;
    billNo?: string;
    expiry?: number;
    created_at?: number;
    updated_at?: number;
    payment_at?: number;
}

export interface CreateCheckoutSessionApiInput {
    amount: number;
    currency: string;
    billNo: string;
    successUrl?: string;
    expirySeconds?: number;
    description?: string;
}

interface OpenApiEnvelope {
    status?: { code?: string | number; message?: unknown };
    data?: unknown;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function envelopeCode(value: unknown): string | null {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number") {
        return String(value);
    }
    return null;
}

function envelopeMessage(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

async function openApiFetch(
    path: string,
    init: RequestInit,
): Promise<Response> {
    const config = requireCheckoutOpenApiConfig();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${config.merchantToken}`);
    const url = `${config.openApiBaseUrl}${path}`;

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(),
            REQUEST_TIMEOUT_MS,
        );

        try {
            const response = await fetch(url, {
                ...init,
                headers,
                signal: controller.signal,
            });

            if (response.status === 429 || response.status >= 500) {
                lastError = new ApiError(response.status, {
                    statusCode: response.status,
                    message: `Bakong Open API returned ${response.status}`,
                    error:
                        response.status === 429
                            ? "Too Many Requests"
                            : "Upstream Error",
                });
            } else {
                return response;
            }
        } catch (error) {
            lastError = error;
        } finally {
            clearTimeout(timer);
        }

        await delay(
            RETRY_BASE_BACKOFF_MS * attempt +
                Math.floor(Math.random() * RETRY_JITTER_MS),
        );
    }

    if (lastError instanceof ApiError) {
        throw lastError;
    }

    throw new ApiError(502, {
        statusCode: 502,
        message: `Bakong Open API unreachable: ${
            lastError instanceof Error ? lastError.message : String(lastError)
        }`,
        error: "Bad Gateway",
    });
}

async function readEnvelope(response: Response): Promise<OpenApiEnvelope> {
    const text = await response.text();
    if (!text.trim()) {
        return {};
    }

    try {
        return JSON.parse(text) as OpenApiEnvelope;
    } catch {
        throw new ApiError(response.ok ? 502 : response.status, {
            statusCode: response.ok ? 502 : response.status,
            message: "Invalid JSON payload from Bakong Open API",
            error: "Bad Gateway",
        });
    }
}

function assertEnvelopeSuccess(
    response: Response,
    envelope: OpenApiEnvelope,
): void {
    const code = envelopeCode(envelope.status?.code);
    const isOkCode = code === null ? response.ok : SUCCESS_CODES.has(code);

    if (!response.ok || !isOkCode) {
        throw new ApiError(response.ok ? 502 : response.status, {
            statusCode: response.ok ? 502 : response.status,
            message:
                envelopeMessage(envelope.status?.message) ??
                `Bakong Open API error (code ${code ?? "unknown"})`,
            error: envelopeMessage(envelope.status?.message)
                ? "Request Failed"
                : "Bad Gateway",
        });
    }
}

function parseSessionData(envelope: OpenApiEnvelope): CheckoutSessionData {
    const data =
        typeof envelope.data === "object" && envelope.data !== null
            ? (envelope.data as Record<string, unknown>)
            : null;

    const sessionId =
        data && typeof data.session_id === "string"
            ? data.session_id.trim()
            : "";

    if (!data || !sessionId) {
        throw new ApiError(502, {
            statusCode: 502,
            message: "Unexpected checkout session payload from Bakong Open API",
            error: "Bad Gateway",
        });
    }

    return {
        session_id: sessionId,
        checkout_url:
            typeof data.checkout_url === "string" ? data.checkout_url : undefined,
        md5: typeof data.md5 === "string" ? data.md5 : undefined,
        status:
            typeof data.status === "string" && data.status.trim().length > 0
                ? data.status.trim().toUpperCase()
                : "PENDING",
        amount: typeof data.amount === "number" ? data.amount : undefined,
        currency:
            typeof data.currency === "string" ? data.currency : undefined,
        billNo: typeof data.billNo === "string" ? data.billNo : undefined,
        expiry: typeof data.expiry === "number" ? data.expiry : undefined,
        created_at:
            typeof data.created_at === "number" ? data.created_at : undefined,
        updated_at:
            typeof data.updated_at === "number" ? data.updated_at : undefined,
        payment_at:
            typeof data.payment_at === "number" ? data.payment_at : undefined,
    };
}

export async function createCheckoutSessionOnOpenApi(
    input: CreateCheckoutSessionApiInput,
    idempotencyKey: string,
): Promise<CheckoutSessionData> {
    const body: Record<string, unknown> = {
        amount: input.amount,
        currency: input.currency,
        billNo: input.billNo,
    };

    if (input.successUrl) {
        body.successUrl = input.successUrl;
    }
    if (input.expirySeconds) {
        body.expirySeconds = input.expirySeconds;
    }
    if (input.description) {
        body.description = input.description;
    }

    const response = await openApiFetch("/v1/checkout/sessions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
    });

    const envelope = await readEnvelope(response);
    assertEnvelopeSuccess(response, envelope);
    return parseSessionData(envelope);
}

export async function getCheckoutSessionFromOpenApi(
    sessionId: string,
    options?: { wait?: boolean; windowSeconds?: number },
): Promise<CheckoutSessionData> {
    const windowSeconds = Math.min(
        Math.max(Math.floor(options?.windowSeconds ?? DEFAULT_WAIT_WINDOW_SECONDS), 1),
        CHECKOUT_WAIT_WINDOW_MAX_SECONDS,
    );
    const waitQuery = options?.wait ? "wait=true&" : "";

    const response = await openApiFetch(
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?${waitQuery}w=${windowSeconds}`,
        { method: "GET" },
    );

    const envelope = await readEnvelope(response);
    assertEnvelopeSuccess(response, envelope);
    return parseSessionData(envelope);
}

export async function cancelCheckoutSessionOnOpenApi(
    sessionId: string,
): Promise<CheckoutSessionData> {
    const response = await openApiFetch(
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/cancel`,
        { method: "POST" },
    );

    const envelope = await readEnvelope(response);
    assertEnvelopeSuccess(response, envelope);
    return parseSessionData(envelope);
}
