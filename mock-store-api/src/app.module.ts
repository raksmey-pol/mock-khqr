import { Module } from "@nestjs/common";

import { CheckoutController } from "./checkout/checkout.controller";
import { CheckoutService } from "./checkout/checkout.service";
import { HealthController } from "./health.controller";
import { WebhookController } from "./webhook/webhook.controller";
import { WebhookStore } from "./webhook/webhook.store";

@Module({
  imports: [],
  controllers: [HealthController, CheckoutController, WebhookController],
  providers: [CheckoutService, WebhookStore],
})
export class AppModule {}
