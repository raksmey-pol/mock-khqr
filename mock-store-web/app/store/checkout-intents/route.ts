import { createCheckoutIntent } from "@/server/checkout-service";
import {
    handlePreflight,
    jsonResponse,
    readJsonBody,
    toErrorResponse,
} from "@/server/http";
import { parseCreateCheckoutIntentPayload } from "@/server/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request): Response {
    return handlePreflight(request);
}

export async function POST(request: Request): Promise<Response> {
    try {
        const body = await readJsonBody(request);
        const payload = parseCreateCheckoutIntentPayload(body);
        const intent = await createCheckoutIntent(payload);
        return jsonResponse(intent, 201, request);
    } catch (error) {
        return toErrorResponse(error, request);
    }
}
