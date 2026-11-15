
import { MemoryOrderStore } from '../../src/memory-store.js';
import type {
  PaymentEvent,
  EventResult
} from '../../src/types.js';

// Test-only fault injection for scenario F002.
// Simulates an application using a new event ID
// for each webhook delivery instead of the original ID.
export class FaultyDedupStore extends MemoryOrderStore {
  private deliveryCount = 0;
  public processingCount = 0;

  override async applyPaymentEvent(
    event: PaymentEvent
  ): Promise<EventResult> {
    this.deliveryCount += 1;

    // Deliberate bug: replace the original event ID.
    const faultyEvent = {
      ...event,
      id: `${event.id}_delivery_${this.deliveryCount}`
    };

    const result = await super.applyPaymentEvent(faultyEvent);

    if (result === 'processed') {
      this.processingCount += 1;
    }

    return result;
  }
}
