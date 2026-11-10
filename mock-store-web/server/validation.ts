export interface CreateCheckoutIntentInput {
    amount: number;
    currency?: string;
    description?: string;
    expiresInMinutes?: number;
    merchantOrderId?: string;
}

const ALLOWED_KEYS = new Set([
    "amount",
    "currency",
    "description",
    "expiresInMinutes",
    "merchantOrderId",
]);

const MAX_CURRENCY_LENGTH = 3;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_MERCHANT_ORDER_ID_LENGTH = 120;
const MIN_EXPIRES_IN_MINUTES = 1;
const MAX_EXPIRES_IN_MINUTES = 180;

export interface CreateCheckoutSessionInput {
    amount: number;
    currency: string;
    billNo: string;
    successUrl?: string;
    expirySeconds?: number;
    description?: string;
}

const CHECKOUT_ALLOWED_KEYS = new Set([
    "amount",
    "currency",
    "billNo",
    "successUrl",
    "success_url",
    "expirySeconds",
    "description",
]);

const MAX_BILL_NO_LENGTH = 32;
const MAX_CHECKOUT_DESCRIPTION_LENGTH = 128;
const MIN_CHECKOUT_EXPIRY_SECONDS = 60;
const MAX_CHECKOUT_EXPIRY_SECONDS = 600;

function assertBillAmountMatchesCurrency(
    amount: number,
    currency: string,
    errors: string[],
): void {
    if (currency === "KHR" && !Number.isInteger(amount)) {
        errors.push("amount must be a whole number for KHR");
    }
    if (
        currency === "USD" &&
        Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9
    ) {
        errors.push("amount must have at most 2 decimal places for USD");
    }
}

function parseSuccessUrl(
    record: Record<string, unknown>,
    errors: string[],
): string | undefined {
    const camelCase = record.successUrl;
    const snakeCase = record.success_url;

    let successUrl: string | undefined;
    if (camelCase !== undefined && camelCase !== null) {
        if (typeof camelCase !== "string") {
            errors.push("successUrl must be a string");
        } else {
            successUrl = camelCase.trim() || undefined;
        }
    }
    if (snakeCase !== undefined && snakeCase !== null) {
        if (typeof snakeCase !== "string") {
            errors.push("success_url must be a string");
        } else {
            const snakeValue = snakeCase.trim() || undefined;
            if (successUrl && snakeValue && successUrl !== snakeValue) {
                errors.push(
                    "successUrl and success_url must be identical when both are supplied",
                );
            } else {
                successUrl = successUrl ?? snakeValue;
            }
        }
    }

    if (successUrl) {
        try {
            const parsed = new URL(successUrl);
            if (parsed.protocol !== "https:") {
                errors.push("successUrl must be an HTTPS URL on a verified domain");
            }
        } catch {
            errors.push("successUrl must be an HTTPS URL on a verified domain");
        }
    }

    return successUrl;
}

export function parseCreateCheckoutSessionPayload(
    body: unknown,
): CreateCheckoutSessionInput {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new ValidationError(["body must be an object"]);
    }

    const record = body as Record<string, unknown>;
    const errors: string[] = [];

    for (const key of Object.keys(record)) {
        if (!CHECKOUT_ALLOWED_KEYS.has(key)) {
            errors.push(`property ${key} should not exist`);
        }
    }

    let amount: number | undefined;
    const rawAmount = record.amount;
    if (rawAmount === undefined || rawAmount === null) {
        errors.push("amount should not be null or undefined");
    } else if (typeof rawAmount !== "number" || Number.isNaN(rawAmount)) {
        errors.push(
            "amount must be a number conforming to the specified constraints",
        );
    } else if (!(rawAmount > 0)) {
        errors.push("amount must be a positive number");
    } else {
        amount = rawAmount;
    }

    const rawCurrency = record.currency;
    let currency: string | undefined;
    if (rawCurrency === undefined || rawCurrency === null) {
        errors.push("currency should not be null or undefined");
    } else if (typeof rawCurrency !== "string") {
        errors.push("currency must be a string");
    } else {
        const trimmed = rawCurrency.trim();
        if (trimmed.length === 0) {
            errors.push("currency should not be empty");
        } else if (trimmed.length > MAX_CURRENCY_LENGTH) {
            errors.push(
                `currency must be shorter than or equal to ${MAX_CURRENCY_LENGTH} characters`,
            );
        } else {
            currency = trimmed.toUpperCase();
            if (currency !== "KHR" && currency !== "USD") {
                errors.push("currency must be KHR or USD");
            }
        }
    }

    if (amount !== undefined && currency !== undefined) {
        assertBillAmountMatchesCurrency(amount, currency, errors);
    }

    let billNo: string | undefined;
    const rawBillNo = record.billNo;
    if (rawBillNo === undefined || rawBillNo === null) {
        errors.push("billNo should not be null or undefined");
    } else if (typeof rawBillNo !== "string") {
        errors.push("billNo must be a string");
    } else {
        const trimmed = rawBillNo.trim();
        if (trimmed.length === 0) {
            errors.push("billNo should not be empty");
        } else if (trimmed.length > MAX_BILL_NO_LENGTH) {
            errors.push(
                `billNo must be shorter than or equal to ${MAX_BILL_NO_LENGTH} characters`,
            );
        } else {
            billNo = trimmed;
        }
    }

    const successUrl = parseSuccessUrl(record, errors);

    let expirySeconds: number | undefined;
    const rawExpires = record.expirySeconds;
    if (rawExpires !== undefined && rawExpires !== null) {
        if (
            typeof rawExpires !== "number" ||
            Number.isNaN(rawExpires) ||
            !Number.isInteger(rawExpires)
        ) {
            errors.push(
                "expirySeconds must be an integer number conforming to the specified constraints",
            );
        } else {
            if (rawExpires < MIN_CHECKOUT_EXPIRY_SECONDS) {
                errors.push(
                    `expirySeconds must not be less than ${MIN_CHECKOUT_EXPIRY_SECONDS}`,
                );
            }
            if (rawExpires > MAX_CHECKOUT_EXPIRY_SECONDS) {
                errors.push(
                    `expirySeconds must not be greater than ${MAX_CHECKOUT_EXPIRY_SECONDS}`,
                );
            }
            expirySeconds = rawExpires;
        }
    }

    let description: string | undefined;
    const rawDescription = record.description;
    if (rawDescription !== undefined && rawDescription !== null) {
        if (typeof rawDescription !== "string") {
            errors.push("description must be a string");
        } else {
            const trimmed = rawDescription.trim();
            if (trimmed.length > MAX_CHECKOUT_DESCRIPTION_LENGTH) {
                errors.push(
                    `description must be shorter than or equal to ${MAX_CHECKOUT_DESCRIPTION_LENGTH} characters`,
                );
            }
            description = trimmed || undefined;
        }
    }

    if (errors.length > 0) {
        throw new ValidationError(errors);
    }

    return {
        amount: amount as number,
        currency: currency as string,
        billNo: billNo as string,
        successUrl,
        expirySeconds,
        description,
    };
}

export class ValidationError extends Error {
    readonly messages: string[];

    constructor(messages: string[]) {
        super("Validation failed");
        this.name = "ValidationError";
        this.messages = messages;
    }
}

function optionalTrimmedString(
    record: Record<string, unknown>,
    key: string,
    maxLength: number,
    errors: string[],
): string | undefined {
    const raw = record[key];
    if (raw === undefined || raw === null) {
        return undefined;
    }

    if (typeof raw !== "string") {
        errors.push(`${key} must be a string`);
        return undefined;
    }

    const value = raw.trim();
    if (value.length > maxLength) {
        errors.push(
            `${key} must be shorter than or equal to ${maxLength} characters`,
        );
    }

    return value;
}

/**
 * Validates a `POST /store/checkout-intents` body.
 *
 * Mirrors the previous class-validator rules from the NestJS mock API:
 * whitelist + reject unknown keys, amount required and positive, currency max
 * 3 chars (trimmed, uppercased), description max 500 chars,
 * expiresInMinutes between 1 and 180, merchantOrderId max 120 chars.
 */
export function parseCreateCheckoutIntentPayload(
    body: unknown,
): CreateCheckoutIntentInput {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new ValidationError(["body must be an object"]);
    }

    const record = body as Record<string, unknown>;
    const errors: string[] = [];

    for (const key of Object.keys(record)) {
        if (!ALLOWED_KEYS.has(key)) {
            errors.push(`property ${key} should not exist`);
        }
    }

    let amount: number | undefined;
    const rawAmount = record.amount;
    if (rawAmount === undefined || rawAmount === null) {
        errors.push("amount should not be null or undefined");
    } else if (typeof rawAmount !== "number" || Number.isNaN(rawAmount)) {
        errors.push(
            "amount must be a number conforming to the specified constraints",
        );
    } else if (!(rawAmount > 0)) {
        errors.push("amount must be a positive number");
    } else {
        amount = rawAmount;
    }

    const rawCurrency = optionalTrimmedString(
        record,
        "currency",
        MAX_CURRENCY_LENGTH,
        errors,
    );
    const currency =
        rawCurrency === undefined ? undefined : rawCurrency.toUpperCase();

    const description = optionalTrimmedString(
        record,
        "description",
        MAX_DESCRIPTION_LENGTH,
        errors,
    );

    const merchantOrderId = optionalTrimmedString(
        record,
        "merchantOrderId",
        MAX_MERCHANT_ORDER_ID_LENGTH,
        errors,
    );

    let expiresInMinutes: number | undefined;
    const rawExpires = record.expiresInMinutes;
    if (rawExpires !== undefined && rawExpires !== null) {
        if (typeof rawExpires !== "number" || Number.isNaN(rawExpires)) {
            errors.push(
                "expiresInMinutes must be a number conforming to the specified constraints",
            );
        } else {
            if (rawExpires < MIN_EXPIRES_IN_MINUTES) {
                errors.push(
                    `expiresInMinutes must not be less than ${MIN_EXPIRES_IN_MINUTES}`,
                );
            }
            if (rawExpires > MAX_EXPIRES_IN_MINUTES) {
                errors.push(
                    `expiresInMinutes must not be greater than ${MAX_EXPIRES_IN_MINUTES}`,
                );
            }
            expiresInMinutes = rawExpires;
        }
    }

    if (errors.length > 0) {
        throw new ValidationError(errors);
    }

    return {
        amount: amount as number,
        currency,
        description,
        expiresInMinutes,
        merchantOrderId,
    };
}
