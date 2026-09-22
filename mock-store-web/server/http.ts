import { ValidationError } from "./validation";

/**
 * Error carrying an HTTP status and a JSON payload.
 *
 * Response shapes intentionally mirror the ones the previous NestJS mock API
 * produced so existing clients keep working unchanged.
 */
export class ApiError extends Error {
    readonly status: number;
    readonly payload: Record<string, unknown>;

    constructor(status: number, payload: Record<string, unknown>) {
        super(
            typeof payload.message === "string"
                ? payload.message
                : `Request failed with status ${status}`,
        );
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function configuredOrigins(): string[] {
    return (process.env.WEB_ORIGIN ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
}

function isOriginAllowed(origin: string): boolean {
    const origins = configuredOrigins();
    return (
        origins.length === 0 ||
        origins.includes(origin) ||
        localhostOriginPattern.test(origin)
    );
}

function corsHeaders(request: Request): Headers {
    const headers = new Headers();
    headers.set("Vary", "Origin");

    const origin = request.headers.get("origin");
    if (origin && isOriginAllowed(origin)) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "*");
    }

    return headers;
}

export function handlePreflight(request: Request): Response {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(
    data: unknown,
    status: number,
    request: Request,
): Response {
    const headers = corsHeaders(request);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(data), { status, headers });
}

export async function readJsonBody(request: Request): Promise<unknown> {
    const text = await request.text();
    if (text.trim().length === 0) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new ApiError(400, {
            statusCode: 400,
            message: "Invalid JSON payload",
            error: "Bad Request",
        });
    }
}

export function toErrorResponse(error: unknown, request: Request): Response {
    if (error instanceof ApiError) {
        return jsonResponse(error.payload, error.status, request);
    }

    if (error instanceof ValidationError) {
        return jsonResponse(
            { statusCode: 400, message: error.messages, error: "Bad Request" },
            400,
            request,
        );
    }

    console.error("Unhandled mock store API route error:", error);
    return jsonResponse(
        {
            statusCode: 500,
            message: "Internal server error",
            error: "Internal Server Error",
        },
        500,
        request,
    );
}
