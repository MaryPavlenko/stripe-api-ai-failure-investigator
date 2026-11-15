import Stripe from 'stripe';
import type { Order, PaymentGateway } from './types.js';

export class StripePaymentGateway implements PaymentGateway {
  private stripe: Stripe;

  constructor(secretKey: string, private webhookSecret: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createPaymentIntent(order: Order) {
    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: order.amount,
        currency: order.currency,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { order_id: order.id }
      },
      { idempotencyKey: `order-${order.id}` }
    );

    return { id: paymentIntent.id, clientSecret: paymentIntent.client_secret };
  }

  verifyWebhook(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
