import { ApiError } from "./http";

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

export interface CheckoutOpenApiConfig {
    openApiBaseUrl: string;
    merchantToken: string;
}

export function getCheckoutOpenApiConfig(): CheckoutOpenApiConfig | null {
    const openApiBaseUrl = firstNonEmpty(
        process.env.BAKONG_OPEN_API_BASE_URL,
        process.env.BAKONG_CHECKOUT_OPEN_API_BASE_URL,
    ).replace(/\/$/, "");
    const merchantToken = firstNonEmpty(process.env.BAKONG_MERCHANT_TOKEN);

    if (!openApiBaseUrl || !merchantToken) {
        return null;
    }

    return { openApiBaseUrl, merchantToken };
}

export function requireCheckoutOpenApiConfig(): CheckoutOpenApiConfig {
    const config = getCheckoutOpenApiConfig();
    if (!config) {
        throw new ApiError(500, {
            statusCode: 500,
            message:
                "Bakong checkout is not configured: set BAKONG_OPEN_API_BASE_URL and BAKONG_MERCHANT_TOKEN (server-side only)",
            error: "Internal Server Error",
        });
    }
    return config;
}

export function resolveCheckoutSuccessUrlDefault(): string | null {
    return firstNonEmpty(process.env.CHECKOUT_SUCCESS_URL) || null;
}

export function resolveDefaultCheckoutExpirySeconds(): number | null {
    const parsed = Number(
        firstNonEmpty(process.env.CHECKOUT_EXPIRY_SECONDS),
    );
    return Number.isFinite(parsed) && parsed >= 60 && parsed <= 600
        ? Math.floor(parsed)
        : null;
}
