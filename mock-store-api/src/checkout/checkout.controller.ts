import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { CreateMockIntentDto } from "./dto/create-mock-intent.dto";
import { CheckoutService } from "./checkout.service";

@Controller("store")
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post("checkout-intents")
  async createCheckoutIntent(
    @Body() payload: CreateMockIntentDto,
  ): Promise<unknown> {
    return this.checkoutService.createCheckoutIntent(payload);
  }

  @Get("checkout-status/:checkoutToken")
  async getCheckoutStatus(
    @Param("checkoutToken") checkoutToken: string,
  ): Promise<unknown> {
    return this.checkoutService.getCheckoutStatus(checkoutToken);
  }
}
