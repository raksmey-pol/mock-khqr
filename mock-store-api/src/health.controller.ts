import { Controller, Get } from "@nestjs/common";

@Controller("store")
export class HealthController {
  @Get("health")
  health() {
    return {
      ok: true,
      service: "mock-store-api",
      timestamp: new Date().toISOString(),
    };
  }
}
