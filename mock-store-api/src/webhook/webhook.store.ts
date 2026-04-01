import { Injectable } from "@nestjs/common";

export interface ReceivedWebhook {
  receivedAt: string;
  deliveryId: string | null;
  timestamp: string | null;
  signature: string | null;
  payload: unknown;
}

@Injectable()
export class WebhookStore {
  private readonly maxEvents = 100;
  private readonly events: ReceivedWebhook[] = [];

  add(event: ReceivedWebhook): void {
    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }
  }

  list(): ReceivedWebhook[] {
    return [...this.events];
  }
}
