import express from 'express';
import type Stripe from 'stripe';
import type { OrderStore, PaymentEvent, PaymentGateway } from './types.js';

export function createApp(store: OrderStore, payments: PaymentGateway) {
  const app = express();
  app.disable('x-powered-by');

  // IMPORTANT: raw body is required for Stripe's signature verification.
  // Register this route BEFORE express.json().
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.header('stripe-signature');
    if (!signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: 'Missing signature or raw payload' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = payments.verifyWebhook(req.body, signature);
    } catch {
      res.status(400).json({ error: 'Invalid webhook signature' });
      return;
    }

    if (event.type !== 'payment_intent.succeeded' && event.type !== 'payment_intent.payment_failed') {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    const intent = event.data.object as Stripe.PaymentIntent;
    const paymentEvent: PaymentEvent = {
      id: event.id,
      type: event.type,
      paymentIntentId: intent.id,
      amount: intent.amount,
      currency: intent.currency
    };
    try {
      const result = await store.applyPaymentEvent(paymentEvent);
      res.status(200).json({ status: result });
    } catch (error) {
      // Do not claim success: return 500 so Stripe knows this event was not processed.
      console.error('Webhook processing failed:', error);
      res.status(500).json({ error: 'Webhook processing failed; retry is safe' });
    }
  });

  app.use(express.json({ limit: '20kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/orders', async (req, res) => {
    const amount: unknown = req.body?.amount;
    // A deliberately small demo: GBP only, £1 to £1,000, amount in pence.
    if (!Number.isInteger(amount) || (amount as number) < 100 || (amount as number) > 100000 || req.body?.currency !== 'gbp') {
      res.status(400).json({ error: 'Provide integer amount 100..100000 in pence and currency gbp' });
      return;
    }

    let order;
    try {
      order = await store.createOrder(amount as number);
      const intent = await payments.createPaymentIntent(order);
      await store.linkPaymentIntent(order.id, intent.id);
      res.status(201).json({ orderId: order.id, amount: order.amount, currency: order.currency,
        status: order.status, paymentIntentId: intent.id, clientSecret: intent.clientSecret });
    } catch (error) {
      console.error('Create order/payment failed:', error);
      // A pending order may exist if the external Stripe request failed.
      res.status(502).json({ error: 'Could not complete order creation', orderId: order?.id });
    }
  });

  app.get('/orders/:id', async (req, res) => {
    try {
      const order = await store.getOrder(req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      res.json(order);
    } catch {
      res.status(500).json({ error: 'Could not fetch order' });
    }
  });

  return app;
}
