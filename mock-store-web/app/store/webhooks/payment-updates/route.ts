import { createHmac, timingSafeEqual } from "node:crypto";

import {
    ApiError,
    handlePreflight,
    jsonResponse,
    toErrorResponse,
} from "@/server/http";
import { applyWebhookStatusUpdate } from "@/server/intent-store";
import { addWebhookEvent } from "@/server/webhook-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request): Response {
    return handlePreflight(request);
}

export async function POST(request: Request): Promise<Response> {
    try {
        const secret = (process.env.MERCHANT_WEBHOOK_SIGNING_SECRET ?? "").trim();
        if (secret.length === 0) {
            throw new ApiError(500, {
                statusCode: 500,
                message: "MERCHANT_WEBHOOK_SIGNING_SECRET is not configured",
                error: "Internal Server Error",
            });
        }

        const timestamp = request.headers.get("x-webhook-timestamp");
        const signature = request.headers.get("x-webhook-signature");
        const deliveryId = request.headers.get("x-webhook-delivery-id");

        if (!timestamp || !signature) {
            throw new ApiError(401, {
                statusCode: 401,
                message: "Missing webhook signature headers",
                error: "Unauthorized",
            });
        }

        const rawBody = await request.text();
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
            timestamp,
            signature,
            payload,
        });

        // Drive the checkout status from verified webhook deliveries.
        const statusUpdate = applyWebhookStatusUpdate(payload);

        return jsonResponse(
            {
                ok: true,
                message: "Webhook accepted",
                matchedIntent: statusUpdate.matched,
            },
            201,
            request,
        );
    } catch (error) {
        return toErrorResponse(error, request);
    }
}
