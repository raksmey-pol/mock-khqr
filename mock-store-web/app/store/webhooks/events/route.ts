import { handlePreflight, jsonResponse, toErrorResponse } from "@/server/http";
import { listWebhookEvents } from "@/server/webhook-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request): Response {
    return handlePreflight(request);
}

export function GET(request: Request): Response {
    try {
        const events = listWebhookEvents();
        return jsonResponse({ count: events.length, events }, 200, request);
    } catch (error) {
        return toErrorResponse(error, request);
    }
}
