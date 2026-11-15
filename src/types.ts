import type Stripe from 'stripe';

export type OrderStatus = 'pending' | 'paid' | 'payment_failed';

export interface Order {
  id: string;
  amount: number; // Smallest currency unit: pence (GBP)
  currency: 'gbp';
  status: OrderStatus;
  stripePaymentIntentId: string | null;
}

export interface PaymentEvent {
  id: string;
  type: 'payment_intent.succeeded' | 'payment_intent.payment_failed';
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export type EventResult = 'processed' | 'duplicate';

export interface OrderStore {
  createOrder(amount: number): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  linkPaymentIntent(orderId: string, paymentIntentId: string): Promise<void>;
  applyPaymentEvent(event: PaymentEvent): Promise<EventResult>;
}

export interface PaymentGateway {
  createPaymentIntent(order: Order): Promise<{ id: string; clientSecret: string | null }>;
  verifyWebhook(payload: Buffer, signature: string): Stripe.Event;
}
