import { jsonResponse } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): Response {
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
