import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

import { WebhookStore } from "./webhook.store";

@Controller("store/webhooks")
export class WebhookController {
  constructor(private readonly webhookStore: WebhookStore) {}

  @Post("payment-updates")
  receivePaymentUpdate(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("x-webhook-timestamp") timestamp: string | undefined,
    @Headers("x-webhook-signature") signature: string | undefined,
    @Headers("x-webhook-delivery-id") deliveryId: string | undefined,
    @Body() body: unknown,
  ) {
    const secret = this.firstNonEmptyEnv([
      process.env.MERCHANT_WEBHOOK_SIGNING_SECRET,
    ]);
    if (!secret) {
      throw new HttpException(
        "MERCHANT_WEBHOOK_SIGNING_SECRET is not configured",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!timestamp || !signature) {
      throw new HttpException(
        "Missing webhook signature headers",
        HttpStatus.UNAUTHORIZED,
      );
    }

    const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(body ?? {});
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
      throw new HttpException(
        "Invalid webhook signature",
        HttpStatus.UNAUTHORIZED,
      );
    }

    this.webhookStore.add({
      receivedAt: new Date().toISOString(),
      deliveryId: deliveryId ?? null,
      timestamp,
      signature,
      payload: body,
    });

    return {
      ok: true,
      message: "Webhook accepted",
    };
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

  @Get("events")
  listReceivedEvents() {
    return {
      count: this.webhookStore.list().length,
      events: this.webhookStore.list(),
    };
  }
}
