import { BakongKHQR, IndividualInfo, khqrData } from "bakong-khqr";

import { ApiError } from "./http";

export interface GeneratedKhqr {
    qr: string;
    md5: string;
}

interface KhqrConfig {
    bakongAccountId: string;
    merchantName: string;
    merchantCity: string;
    acquiringBank?: string;
    accountInformation?: string;
    mobileNumber?: string;
    storeLabel?: string;
    terminalLabel?: string;
}

interface GenerateKhqrOptions {
    amount: number;
    currency: string;
    expiresInMinutes: number;
    billNumber?: string;
}

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

function loadKhqrConfig(): KhqrConfig {
    const bakongAccountId = firstNonEmpty(process.env.BAKONG_ACCOUNT_ID);
    if (!bakongAccountId) {
        throw new ApiError(500, {
            statusCode: 500,
            message: "BAKONG_ACCOUNT_ID is not configured",
            error: "Internal Server Error",
        });
    }

    return {
        bakongAccountId,
        merchantName: firstNonEmpty(process.env.MERCHANT_NAME) || "Mock Merchant",
        merchantCity: firstNonEmpty(process.env.MERCHANT_CITY) || "Phnom Penh",
        acquiringBank: firstNonEmpty(process.env.ACQUIRING_BANK) || undefined,
        accountInformation:
            firstNonEmpty(process.env.ACCOUNT_INFORMATION) || undefined,
        mobileNumber: firstNonEmpty(process.env.MOBILE_NUMBER) || undefined,
        storeLabel: firstNonEmpty(process.env.STORE_LABEL) || undefined,
        terminalLabel: firstNonEmpty(process.env.TERMINAL_LABEL) || undefined,
    };
}

function resolveCurrencyCode(currency: string): number {
    switch (currency.trim().toUpperCase()) {
        case "KHR":
            return khqrData.currency.khr;
        case "USD":
            return khqrData.currency.usd;
        default:
            throw new ApiError(400, {
                statusCode: 400,
                message: `currency "${currency}" is not supported (use KHR or USD)`,
                error: "Bad Request",
            });
    }
}

function extractKhqrErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "status" in error) {
        const status = (error as { status?: { message?: unknown } }).status;
        if (status && typeof status.message === "string" && status.message) {
            return status.message;
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "unknown KHQR generation error";
}

/**
 * Generates a dynamic KHQR payload locally with the official Bakong SDK —
 * the same way the Open Banking backend does (`IndividualInfo` + expiration
 * timestamp in epoch milliseconds).
 */
export function generateCheckoutKhqr(options: GenerateKhqrOptions): GeneratedKhqr {
    const config = loadKhqrConfig();
    const currencyCode = resolveCurrencyCode(options.currency);

    try {
        const individualInfo = new IndividualInfo(
            config.bakongAccountId,
            config.merchantName,
            config.merchantCity,
            {
                currency: currencyCode,
                amount: options.amount,
                acquiringBank: config.acquiringBank,
                accountInformation: config.accountInformation,
                mobileNumber: config.mobileNumber,
                storeLabel: config.storeLabel,
                terminalLabel: config.terminalLabel,
                billNumber: options.billNumber,
                expirationTimestamp:
                    Date.now() + options.expiresInMinutes * 60 * 1000,
            },
        );

        const response = new BakongKHQR().generateIndividual(individualInfo);

        if (response.status?.code !== 0 || !response.data?.qr) {
            throw new ApiError(400, {
                statusCode: 400,
                message: `Unable to generate KHQR: ${response.status?.message ?? "unknown error"
                    }`,
                error: "Bad Request",
            });
        }

        return { qr: response.data.qr, md5: response.data.md5 };
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        // The SDK throws structured error payloads (not Error instances) for
        // invalid input such as decimal KHR amounts.
        throw new ApiError(400, {
            statusCode: 400,
            message: `Unable to generate KHQR: ${extractKhqrErrorMessage(error)}`,
            error: "Bad Request",
        });
    }
}
