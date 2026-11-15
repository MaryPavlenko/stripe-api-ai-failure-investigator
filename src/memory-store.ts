import { randomUUID } from 'node:crypto';
import type { EventResult, Order, OrderStore, PaymentEvent } from './types.js';

/** Test-only store. Production uses PostgresOrderStore. */
export class MemoryOrderStore implements OrderStore {
  private orders = new Map<string, Order>();
  private processedEvents = new Set<string>();
  public failNextEvent = false;

  async createOrder(amount: number): Promise<Order> {
    const order: Order = {
      id: randomUUID(), amount, currency: 'gbp', status: 'pending', stripePaymentIntentId: null
    };
    this.orders.set(order.id, order);
    return { ...order };
  }

  async getOrder(id: string): Promise<Order | null> {
    const order = this.orders.get(id);
    return order ? { ...order } : null;
  }

  async linkPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order || order.stripePaymentIntentId) throw new Error('Could not link PaymentIntent');
    order.stripePaymentIntentId = paymentIntentId;
  }

  async applyPaymentEvent(event: PaymentEvent): Promise<EventResult> {
    if (this.processedEvents.has(event.id)) return 'duplicate';
    if (this.failNextEvent) {
      this.failNextEvent = false;
      throw new Error('Simulated database timeout');
    }

    const order = [...this.orders.values()].find(
      (item) => item.stripePaymentIntentId === event.paymentIntentId
        && item.amount === event.amount
        && item.currency === event.currency
    );
    if (!order) throw new Error('No matching order for PaymentIntent, amount and currency');
    if (event.type === 'payment_intent.succeeded') order.status = 'paid';
    if (event.type === 'payment_intent.payment_failed' && order.status !== 'paid') {
      order.status = 'payment_failed';
    }
    this.processedEvents.add(event.id);
    return 'processed';
  }
}
