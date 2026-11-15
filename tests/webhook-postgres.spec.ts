
import 'dotenv/config';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { test, expect } from './fixtures/evidence-test.js';
import { createApp } from '../src/app.js';
import { PostgresOrderStore } from '../src/postgres-store.js';
import type { Order, PaymentGateway } from '../src/types.js';

const TEST_WEBHOOK_SECRET = 'whsec_local_example_for_automated_tests';
const stripe = new Stripe('sk_test_local_not_a_real_key');

// Always connect to the isolated test database.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is missing');
}

const url = new URL(databaseUrl);

if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('PostgreSQL integration tests require a local database');
}

url.pathname = '/payment_lab_test';

const pool = new Pool({ connectionString: url.toString() });

class FakePaymentGateway implements PaymentGateway {
  async createPaymentIntent(order: Order) {
    return {
      id: `pi_test_${order.id}`,
      clientSecret: 'client_secret_test_only'
    };
  }

  verifyWebhook(payload: Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      TEST_WEBHOOK_SECRET
    );
  }
}

test.beforeAll(async () => {
  const result = await pool.query('SELECT current_database() AS name');

  if (result.rows[0].name !== 'payment_lab_test') {
    throw new Error('Refusing to run tests outside payment_lab_test');
  }
});

test.afterAll(async () => {
  await pool.end();
});

test('stores a failed payment webhook in PostgreSQL', async ({ playwright }) => {
  const store = new PostgresOrderStore(pool);
  const server = createApp(store, new FakePaymentGateway()).listen(0, '127.0.0.1');

  await once(server, 'listening');

  const port = (server.address() as AddressInfo).port;
  const api = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${port}`
  });

  let orderId: string | undefined;
  let eventId: string | undefined;

  try {
    // 1. Create a pending order.
    const createResponse = await api.post('/orders', {
      data: { amount: 1000, currency: 'gbp' }
    });

    expect(createResponse.status()).toBe(201);

    const order = await createResponse.json();
    orderId = order.orderId;

    expect(order.status).toBe('pending');

    // 2. Create a signed payment failure event.
    eventId = `evt_${randomUUID()}`;

    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'payment_intent.payment_failed',
      livemode: false,
      data: {
        object: {
          id: order.paymentIntentId,
          object: 'payment_intent',
          amount: 1000,
          currency: 'gbp'
        }
      }
    });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET
    });

    // 3. Send the webhook to Express.
    const webhookResponse = await api.post('/webhooks/stripe', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature
      }
    });

    expect(webhookResponse.status()).toBe(200);
    expect(await webhookResponse.json()).toEqual({
      status: 'processed'
    });

    // 4. Verify the order status in PostgreSQL.
    const savedOrder = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    expect(savedOrder.rows).toHaveLength(1);
    expect(savedOrder.rows[0].status).toBe('payment_failed');

    // 5. Verify the webhook event was recorded.
    const savedEvent = await pool.query(
      'SELECT event_type, stripe_payment_intent_id FROM webhook_events WHERE id = $1',
      [eventId]
    );

    expect(savedEvent.rows).toHaveLength(1);
    expect(savedEvent.rows[0].event_type).toBe('payment_intent.payment_failed');
    expect(savedEvent.rows[0].stripe_payment_intent_id).toBe(
      order.paymentIntentId
    );
  } finally {
    await api.dispose();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    // Clean up only the records created by this test.
    if (eventId) {
      await pool.query('DELETE FROM webhook_events WHERE id = $1', [eventId]);
    }

    if (orderId) {
      await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
    }
  }
});

test('handles duplicate webhook delivery in PostgreSQL', async ({ playwright }) => {
  const store = new PostgresOrderStore(pool);
  const server = createApp(store, new FakePaymentGateway()).listen(0, '127.0.0.1');

  await once(server, 'listening');

  const port = (server.address() as AddressInfo).port;
  const api = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${port}`
  });

  let orderId: string | undefined;
  const eventId = `evt_${randomUUID()}`;

  try {
    const response = await api.post('/orders', {
      data: { amount: 1000, currency: 'gbp' }
    });

    expect(response.status()).toBe(201);

    const order = await response.json();
    orderId = order.orderId;

    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: order.paymentIntentId,
          object: 'payment_intent',
          amount: 1000,
          currency: 'gbp'
        }
      }
    });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET
    });

    const sendWebhook = () => api.post('/webhooks/stripe', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature
      }
    });

    // First delivery.
    const first = await sendWebhook();
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ status: 'processed' });

    // Same event delivered again.
    const second = await sendWebhook();
    expect(second.status()).toBe(200);
    expect(await second.json()).toEqual({ status: 'duplicate' });

    // Only one event should exist in PostgreSQL.
    const events = await pool.query(
      'SELECT COUNT(*)::int AS total FROM webhook_events WHERE id = $1',
      [eventId]
    );

    expect(events.rows[0].total).toBe(1);

    // Order remains paid.
    const orders = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    expect(orders.rows[0].status).toBe('paid');

  } finally {
    await api.dispose();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    await pool.query('DELETE FROM webhook_events WHERE id = $1', [eventId]);

    if (orderId) {
      await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
    }
  }
});


test('preserves a paid order when a failure webhook arrives late', async ({ playwright }) => {
  const store = new PostgresOrderStore(pool);
  const server = createApp(store, new FakePaymentGateway()).listen(0, '127.0.0.1');

  await once(server, 'listening');

  const port = (server.address() as AddressInfo).port;
  const api = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${port}`
  });

  const successEventId = `evt_${randomUUID()}`;
  const failureEventId = `evt_${randomUUID()}`;
  let orderId: string | undefined;

  try {
    // 1. Create a pending order.
    const createResponse = await api.post('/orders', {
      data: { amount: 1000, currency: 'gbp' }
    });

    expect(createResponse.status()).toBe(201);

    const order = await createResponse.json();
    orderId = order.orderId;

    expect(order.status).toBe('pending');

    // Helper for sending signed webhook events.
    const sendWebhook = (type: string, eventId: string) => {
      const payload = JSON.stringify({
        id: eventId,
        object: 'event',
        type,
        livemode: false,
        data: {
          object: {
            id: order.paymentIntentId,
            object: 'payment_intent',
            amount: 1000,
            currency: 'gbp'
          }
        }
      });

      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: TEST_WEBHOOK_SECRET
      });

      return api.post('/webhooks/stripe', {
        data: payload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature
        }
      });
    };

    // 2. Successful payment arrives first.
    const success = await sendWebhook(
      'payment_intent.succeeded',
      successEventId
    );

    expect(success.status()).toBe(200);
    expect(await success.json()).toEqual({ status: 'processed' });

    const paidOrder = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    expect(paidOrder.rows[0].status).toBe('paid');

    // 3. An older failure event arrives afterwards.
    const failure = await sendWebhook(
      'payment_intent.payment_failed',
      failureEventId
    );

    expect(failure.status()).toBe(200);
    expect(await failure.json()).toEqual({ status: 'processed' });

    // 4. The late failure must not overwrite 'paid'.
    const finalOrder = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    expect(finalOrder.rows[0].status).toBe('paid');

    // Both distinct events should be recorded.
    const events = await pool.query(
      'SELECT COUNT(*)::int AS total FROM webhook_events WHERE id IN ($1, $2)',
      [successEventId, failureEventId]
    );

    expect(events.rows[0].total).toBe(2);

  } finally {
    await api.dispose();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    await pool.query(
      'DELETE FROM webhook_events WHERE id IN ($1, $2)',
      [successEventId, failureEventId]
    );

    if (orderId) {
      await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
    }
  }
});

test('returns 500 and processes a webhook after recovery', async ({ playwright }) => {
  const store = new PostgresOrderStore(pool);
  const server = createApp(store, new FakePaymentGateway()).listen(0, '127.0.0.1');

  await once(server, 'listening');

  const port = (server.address() as AddressInfo).port;
  const api = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${port}`
  });

  const eventId = `evt_${randomUUID()}`;
  let orderId: string | undefined;

  try {
    // 1. Create a pending order.
    const createResponse = await api.post('/orders', {
      data: { amount: 1000, currency: 'gbp' }
    });

    expect(createResponse.status()).toBe(201);

    const order = await createResponse.json();
    orderId = order.orderId;

    // 2. Simulate a temporarily missing PaymentIntent link.
    const unlink = await pool.query(
      'UPDATE orders SET stripe_payment_intent_id = NULL WHERE id = $1 AND stripe_payment_intent_id = $2',
      [orderId, order.paymentIntentId]
    );

    expect(unlink.rowCount).toBe(1);

    // 3. Prepare one signed webhook event.
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: order.paymentIntentId,
          object: 'payment_intent',
          amount: 1000,
          currency: 'gbp'
        }
      }
    });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET
    });

    const sendWebhook = () => api.post('/webhooks/stripe', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature
      }
    });

    // 4. First attempt fails because the order cannot be matched.
    const first = await sendWebhook();

    expect(first.status()).toBe(500);
    expect(await first.json()).toEqual({
      error: 'Webhook processing failed; retry is safe'
    });

    // The failed transaction must not record the event.
    const eventsAfterFailure = await pool.query(
      'SELECT COUNT(*)::int AS total FROM webhook_events WHERE id = $1',
      [eventId]
    );

    expect(eventsAfterFailure.rows[0].total).toBe(0);

    const orderAfterFailure = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    expect(orderAfterFailure.rows[0].status).toBe('pending');

    // 5. Restore the missing PaymentIntent link.
    await store.linkPaymentIntent(orderId!, order.paymentIntentId);

    // 6. Retry exactly the same webhook.
    const retry = await sendWebhook();

    expect(retry.status()).toBe(200);
    expect(await retry.json()).toEqual({ status: 'processed' });

    // 7. Verify the order was updated.
    const finalOrder = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    expect(finalOrder.rows[0].status).toBe('paid');

    // The event should now exist exactly once.
    const finalEvents = await pool.query(
      'SELECT COUNT(*)::int AS total FROM webhook_events WHERE id = $1',
      [eventId]
    );

    expect(finalEvents.rows[0].total).toBe(1);

  } finally {
    await api.dispose();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    await pool.query('DELETE FROM webhook_events WHERE id = $1', [eventId]);

    if (orderId) {
      await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
    }
  }
});


test('prevents duplicate processing of concurrent webhooks', async ({ playwright }) => {
  const store = new PostgresOrderStore(pool);
  const server = createApp(store, new FakePaymentGateway()).listen(0, '127.0.0.1');

  await once(server, 'listening');

  const port = (server.address() as AddressInfo).port;
  const api = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${port}`
  });

  const eventId = `evt_${randomUUID()}`;
  let orderId: string | undefined;

  try {
    // 1. Create a pending order.
    const createResponse = await api.post('/orders', {
      data: { amount: 1000, currency: 'gbp' }
    });

    expect(createResponse.status()).toBe(201);

    const order = await createResponse.json();
    orderId = order.orderId;

    // 2. Prepare one signed success event.
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: order.paymentIntentId,
          object: 'payment_intent',
          amount: 1000,
          currency: 'gbp'
        }
      }
    });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET
    });

    const sendWebhook = () => api.post('/webhooks/stripe', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature
      }
    });

    // 3. Send five identical requests concurrently.
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => sendWebhook())
    );

    // 4. Check that all requests received HTTP 200.
    const statuses: string[] = [];

    for (const response of responses) {
      expect(response.status()).toBe(200);
      const body = await response.json();
      statuses.push(body.status);
    }

    // Exactly one request should process the event.
    expect(statuses.filter(status => status === 'processed')).toHaveLength(1);
    expect(statuses.filter(status => status === 'duplicate')).toHaveLength(4);

    // 5. Verify only one event was stored.
    const events = await pool.query(
      'SELECT COUNT(*)::int AS total FROM webhook_events WHERE id = $1',
      [eventId]
    );

    expect(events.rows[0].total).toBe(1);

    // 6. Verify only one order exists for this PaymentIntent.
    const orders = await pool.query(
      'SELECT COUNT(*)::int AS total FROM orders WHERE stripe_payment_intent_id = $1',
      [order.paymentIntentId]
    );

    expect(orders.rows[0].total).toBe(1);

    // 7. Verify the final payment status.
    const finalOrder = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    expect(finalOrder.rows[0].status).toBe('paid');

  } finally {
    await api.dispose();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    await pool.query(
      'DELETE FROM webhook_events WHERE id = $1',
      [eventId]
    );

    if (orderId) {
      await pool.query(
        'DELETE FROM orders WHERE id = $1',
        [orderId]
      );
    }
  }
});
