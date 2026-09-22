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
