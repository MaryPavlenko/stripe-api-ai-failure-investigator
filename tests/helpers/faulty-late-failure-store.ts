
import { randomUUID } from 'node:crypto';

import type {
  Order,
  OrderStore,
  PaymentEvent,
  EventResult
} from '../../src/types.js';

// Test-only fault injection for scenario F004.
// Simulates an incorrect payment status transition.
export class FaultyLateFailureStore implements OrderStore {
  private orders = new Map<string, Order>();
  private processedEvents = new Set<string>();

  async createOrder(amount: number): Promise<Order> {
    const order: Order = {
      id: randomUUID(),
      amount,
      currency: 'gbp',
      status: 'pending',
      stripePaymentIntentId: null
    };

    this.orders.set(order.id, order);

    return { ...order };
  }

  async getOrder(id: string): Promise<Order | null> {
    const order = this.orders.get(id);
    return order ? { ...order } : null;
  }

  async linkPaymentIntent(
    orderId: string,
    paymentIntentId: string
  ): Promise<void> {
    const order = this.orders.get(orderId);

    if (!order || order.stripePaymentIntentId) {
      throw new Error('Could not link PaymentIntent');
    }

    order.stripePaymentIntentId = paymentIntentId;
  }

  async applyPaymentEvent(
    event: PaymentEvent
  ): Promise<EventResult> {
    if (this.processedEvents.has(event.id)) {
      return 'duplicate';
    }

    const order = [...this.orders.values()].find(
      item =>
        item.stripePaymentIntentId === event.paymentIntentId &&
        item.amount === event.amount &&
        item.currency === event.currency
    );

    if (!order) {
      throw new Error(
        'No matching order for PaymentIntent, amount and currency'
      );
    }

    if (event.type === 'payment_intent.succeeded') {
      order.status = 'paid';
    }

    // Deliberate bug: a late failure can overwrite "paid".
    if (event.type === 'payment_intent.payment_failed') {
      order.status = 'payment_failed';
    }

    this.processedEvents.add(event.id);

    return 'processed';
  }
}
