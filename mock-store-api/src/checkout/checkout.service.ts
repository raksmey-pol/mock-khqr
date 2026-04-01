import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { createHash, createHmac, randomUUID } from "node:crypto";

import { CreateMockIntentDto } from "./dto/create-mock-intent.dto";

interface OpenBankingIntentResponse {
  paymentId: string;
  paymentRef: string;
  status: string;
  amount: number;
  currency: string;
  qrPayload: string;
  khqrMd5: string;
  paymentExpiresAt: string;
  checkoutToken: string;
  checkoutTokenExpiresAt: string;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly baseUrl =
    process.env.OPEN_BANKING_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:8080";
  private readonly merchantId = process.env.MERCHANT_ID ?? "";
  private readonly apiSigningSecret = this.firstNonEmptyEnv([
    process.env.MERCHANT_API_SIGNING_SECRET,
  ]);
  private readonly webhookSigningSecret = this.firstNonEmptyEnv([
    process.env.MERCHANT_WEBHOOK_SIGNING_SECRET,
  ]);
  private readonly defaultCurrency = process.env.DEFAULT_CURRENCY ?? "KHR";
  private readonly defaultExpiresInMinutes = Number(
    process.env.DEFAULT_EXPIRES_IN_MINUTES ?? "15",
  );

  async createCheckoutIntent(
    payload: CreateMockIntentDto,
  ): Promise<OpenBankingIntentResponse> {
    this.assertConfig();

    const body = {
      amount: payload.amount,
      currency: payload.currency ?? this.defaultCurrency,
      description: payload.description ?? "Mock store checkout",
      expiresInMinutes:
        payload.expiresInMinutes ?? this.defaultExpiresInMinutes,
      merchantOrderId: payload.merchantOrderId ?? `MOCK-${Date.now()}`,
    };

    const idempotencyKey = `mock-${body.merchantOrderId}-create-intent`;
    const requestFingerprint = this.buildRequestFingerprint(body);

    let lastError: HttpException | null = null;
    const signingSecrets = this.getSigningSecretCandidates();

    for (let index = 0; index < signingSecrets.length; index += 1) {
      const secret = signingSecrets[index];
      const result = await this.sendCreateIntentRequest(
        body,
        secret,
        idempotencyKey,
        requestFingerprint,
      );

      if (result.ok) {
        if (index > 0) {
          this.logger.warn(
            "Primary API signing secret failed; create-intent succeeded with fallback secret. Sync MERCHANT_API_SIGNING_SECRET.",
          );
        }
        return result.parsed as OpenBankingIntentResponse;
      }

      const message = this.extractErrorMessage(
        result.parsed,
        result.response.status,
      );
      const shouldRetryWithNextSecret =
        index < signingSecrets.length - 1 &&
        result.response.status === HttpStatus.UNAUTHORIZED &&
        message === "Invalid request signature";

      if (shouldRetryWithNextSecret) {
        continue;
      }

      lastError = new HttpException(
        {
          message,
          upstreamStatus: result.response.status,
          upstreamBody: result.parsed,
        },
        result.response.status >= 400 && result.response.status < 500
          ? result.response.status
          : HttpStatus.BAD_GATEWAY,
      );
      break;
    }

    if (lastError) {
      throw lastError;
    }

    throw new HttpException(
      "Open banking create intent failed",
      HttpStatus.BAD_GATEWAY,
    );
  }

  async getCheckoutStatus(checkoutToken: string): Promise<unknown> {
    const response = await fetch(
      `${this.baseUrl}/api/checkout/status/${encodeURIComponent(checkoutToken)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { message: text };
    }

    if (!response.ok) {
      throw new HttpException(
        {
          message: "Open banking checkout status lookup failed",
          upstreamStatus: response.status,
          upstreamBody: parsed,
        },
        response.status >= 400 && response.status < 500
          ? response.status
          : HttpStatus.BAD_GATEWAY,
      );
    }

    return parsed;
  }

  private buildRequestFingerprint(payload: {
    amount: number;
    currency: string;
    description: string;
    expiresInMinutes: number;
    merchantOrderId: string;
  }): string {
    const amount = Number(payload.amount).toString();
    const currency = this.normalizeText(payload.currency).toUpperCase();
    const description = this.normalizeText(payload.description);
    const expiresInMinutes = String(payload.expiresInMinutes);
    const merchantOrderId = this.normalizeText(payload.merchantOrderId);
    const value = [
      amount,
      currency,
      description,
      expiresInMinutes,
      merchantOrderId,
    ].join("|");
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private normalizeText(value: string | null | undefined): string {
    return (value ?? "").toString().trim();
  }

  private firstNonEmptyEnv(values: Array<string | undefined>): string {
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

  private getSigningSecretCandidates(): string[] {
    const candidates: string[] = [];
    if (this.apiSigningSecret) {
      candidates.push(this.apiSigningSecret);
    }
    if (
      this.webhookSigningSecret &&
      this.webhookSigningSecret !== this.apiSigningSecret
    ) {
      candidates.push(this.webhookSigningSecret);
    }
    return candidates;
  }

  private async sendCreateIntentRequest(
    body: {
      amount: number;
      currency: string;
      description: string;
      expiresInMinutes: number;
      merchantOrderId: string;
    },
    signingSecret: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<{ response: Response; parsed: unknown; ok: boolean }> {
    const timestamp = Date.now();
    const nonce = randomUUID();

    const canonical = [
      "POST",
      "/api/checkout/intents",
      this.merchantId,
      String(timestamp),
      nonce,
      idempotencyKey,
      requestFingerprint,
    ].join("\n");

    const signature = createHmac("sha256", signingSecret)
      .update(canonical, "utf8")
      .digest("hex");

    const response = await fetch(`${this.baseUrl}/api/checkout/intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": this.merchantId,
        "X-Timestamp": String(timestamp),
        "X-Nonce": nonce,
        "Idempotency-Key": idempotencyKey,
        "X-Signature": signature,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let parsed: unknown = null;
    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsed = { message: responseText };
    }

    return { response, parsed, ok: response.ok };
  }

  private extractErrorMessage(parsed: unknown, status: number): string {
    if (typeof parsed === "object" && parsed && "message" in parsed) {
      return String((parsed as { message?: unknown }).message);
    }
    return `Open banking create intent failed with status ${status}`;
  }

  private assertConfig(): void {
    if (!this.merchantId) {
      throw new HttpException(
        "MERCHANT_ID is not configured",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (this.getSigningSecretCandidates().length === 0) {
      throw new HttpException(
        "MERCHANT_API_SIGNING_SECRET or MERCHANT_WEBHOOK_SIGNING_SECRET is not configured",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
