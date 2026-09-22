import {
    createCheckoutIntent,
    getCheckoutStatus,
} from "@/server/checkout-service";
import {
    ApiError,
    handlePreflight,
    jsonResponse,
    readJsonBody,
    toErrorResponse,
} from "@/server/http";
import { parseCreateCheckoutIntentPayload } from "@/server/validation";
import { handlePaymentUpdateWebhook } from "@/server/webhook-service";
import { listWebhookEvents } from "@/server/webhook-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Single catch-all route for every `/store/*` endpoint.
 *
 * Why one file for all endpoints: on serverless platforms (e.g. Vercel) each
 * route handler is deployed as its own function with its own memory. The mock
 * keeps checkout intents and webhook deliveries in process memory ("local
 * storage"), so create-intent, status polling, and the webhook callback must be
 * served by the same function for them to see the same data.
 *
 * Endpoints:
 * - GET  /store/health
 * - POST /store/checkout-intents
 * - GET  /store/checkout-status/:checkoutToken
 * - POST /store/webhooks/payment-updates
 * - GET  /store/webhooks/events
 */

interface RouteContext {
    params: { path: string[] };
}

function notFound(path: string[]): ApiError {
    return new ApiError(404, {
        statusCode: 404,
        message: `Not found: /store/${(path ?? []).join("/")}`,
        error: "Not Found",
    });
}

export function OPTIONS(request: Request): Response {
    return handlePreflight(request);
}

export async function GET(
    request: Request,
    context: RouteContext,
): Promise<Response> {
    const [segment, ...rest] = context.params.path;

    try {
        if (segment === "health" && rest.length === 0) {
            return jsonResponse(
                {
                    ok: true,
                    service: "mock-store-web",
                    timestamp: new Date().toISOString(),
                },
                200,
                request,
            );
        }

        if (segment === "checkout-status" && rest.length === 1) {
            return jsonResponse(getCheckoutStatus(rest[0]), 200, request);
        }

        if (
            segment === "webhooks" &&
            rest.length === 1 &&
            rest[0] === "events"
        ) {
            const events = listWebhookEvents();
            return jsonResponse({ count: events.length, events }, 200, request);
        }

        throw notFound(context.params.path);
    } catch (error) {
        return toErrorResponse(error, request);
    }
}

export async function POST(
    request: Request,
    context: RouteContext,
): Promise<Response> {
    const [segment, ...rest] = context.params.path;

    try {
        if (segment === "checkout-intents" && rest.length === 0) {
            const body = await readJsonBody(request);
            const payload = parseCreateCheckoutIntentPayload(body);
            const intent = await createCheckoutIntent(payload);
            return jsonResponse(intent, 201, request);
        }

        if (
            segment === "webhooks" &&
            rest.length === 1 &&
            rest[0] === "payment-updates"
        ) {
            const result = await handlePaymentUpdateWebhook(request);
            return jsonResponse(
                {
                    ok: true,
                    message: "Webhook accepted",
                    matchedIntent: result.matchedIntent,
                },
                201,
                request,
            );
        }

        throw notFound(context.params.path);
    } catch (error) {
        return toErrorResponse(error, request);
    }
}
