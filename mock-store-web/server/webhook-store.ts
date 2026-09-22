export interface ReceivedWebhook {
    receivedAt: string;
    deliveryId: string | null;
    timestamp: string | null;
    signature: string | null;
    payload: unknown;
}

const MAX_EVENTS = 100;
const GLOBAL_STORE_KEY = "__mockStoreWebhookStore__";

interface WebhookStoreState {
    events: ReceivedWebhook[];
}

/**
 * In-memory webhook inbox (last 100 deliveries).
 *
 * Stored on `globalThis` so the history survives module reloads during local
 * development (`next dev` hot reload). Like the previous NestJS service, this
 * is per-process state: restarting the server clears it, and multiple server
 * instances each keep their own copy.
 */
function getWebhookStore(): WebhookStoreState {
    const globalObject = globalThis as typeof globalThis & {
        [GLOBAL_STORE_KEY]?: WebhookStoreState;
    };

    if (!globalObject[GLOBAL_STORE_KEY]) {
        globalObject[GLOBAL_STORE_KEY] = { events: [] };
    }

    return globalObject[GLOBAL_STORE_KEY] as WebhookStoreState;
}

export function addWebhookEvent(event: ReceivedWebhook): void {
    const store = getWebhookStore();
    store.events.unshift(event);
    if (store.events.length > MAX_EVENTS) {
        store.events.length = MAX_EVENTS;
    }
}

export function listWebhookEvents(): ReceivedWebhook[] {
    return [...getWebhookStore().events];
}
