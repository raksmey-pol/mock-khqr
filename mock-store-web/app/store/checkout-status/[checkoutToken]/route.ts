import { getCheckoutStatus } from "@/server/checkout-service";
import { handlePreflight, jsonResponse, toErrorResponse } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
    params: { checkoutToken: string };
}

export function OPTIONS(request: Request): Response {
    return handlePreflight(request);
}

export async function GET(
    request: Request,
    context: RouteContext,
): Promise<Response> {
    try {
        const status = await getCheckoutStatus(context.params.checkoutToken);
        return jsonResponse(status, 200, request);
    } catch (error) {
        return toErrorResponse(error, request);
    }
}
