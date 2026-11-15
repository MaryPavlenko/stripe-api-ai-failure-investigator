import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/memory-store.js';
import type { Order, PaymentGateway } from '../src/types.js';

const TEST_WEBHOOK_SECRET = 'whsec_local_example_for_automated_tests';
const stripe = new Stripe('sk_test_local_not_a_real_key');

class FakePaymentGateway implements PaymentGateway {
  async createPaymentIntent(order: Order) {
    return { id: `pi_test_${order.id}`, clientSecret: 'client_secret_test_only' };
  }
  verifyWebhook(payload: Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(payload, signature, TEST_WEBHOOK_SECRET);
  }
}

let server: Server;
let api: APIRequestContext;
let store: MemoryOrderStore;

async function newOrder(amount = 1000) {
  const response = await api.post('/orders', { data: { amount, currency: 'gbp' } });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ orderId: string; paymentIntentId: string; status: string }>;
}

function signedEvent(paymentIntentId: string, type: string, options?: { id?: string; amount?: number }) {
  const payload = JSON.stringify({
    id: options?.id ?? `evt_${randomUUID()}`,
    object: 'event',
    type,
    livemode: false,
    data: { object: {
      id: paymentIntentId, object: 'payment_intent',
      amount: options?.amount ?? 1000,
      currency: 'gbp'
    } }
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
  return { payload, signature };
}

async function sendWebhook(paymentIntentId: string, type: string, options?: { id?: string; amount?: number }) {
  const { payload, signature } = signedEvent(paymentIntentId, type, options);
  return api.post('/webhooks/stripe', {
    data: payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature }
  });
}

test.beforeEach(async ({ playwright }) => {
  store = new MemoryOrderStore();
  server = createApp(store, new FakePaymentGateway()).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  api = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${port}` });
});

test.afterEach(async () => {
  await api.dispose();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('creates a pending £10 order and links a test PaymentIntent', async () => {
  const order = await newOrder();
  expect(order.status).toBe('pending');
  expect(order.paymentIntentId).toContain('pi_test_');
  const response = await api.get(`/orders/${order.orderId}`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ amount: 1000, currency: 'gbp', status: 'pending' });
});

test('rejects invalid amounts instead of creating payments', async () => {
  const response = await api.post('/orders', { data: { amount: 12.5, currency: 'gbp' } });
  expect(response.status()).toBe(400);
});

test('updates an order only after a valid signed success webhook', async () => {
  const order = await newOrder();
  const webhook = await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded');
  expect(webhook.status()).toBe(200);
  expect(await webhook.json()).toEqual({ status: 'processed' });
  const response = await api.get(`/orders/${order.orderId}`);
  expect((await response.json()).status).toBe('paid');
});

test('rejects a forged or invalid webhook signature', async () => {
  const order = await newOrder();
  const { payload } = signedEvent(order.paymentIntentId, 'payment_intent.succeeded');
  const response = await api.post('/webhooks/stripe', {
    data: payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': 'invalid_signature' }
  });
  expect(response.status()).toBe(400);
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('pending');
});

test('processes a duplicate webhook only once', async () => {
  const order = await newOrder();
  const id = 'evt_same_event';
  const first = await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded', { id });
  const second = await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded', { id });
  expect((await first.json()).status).toBe('processed');
  expect((await second.json()).status).toBe('duplicate');
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('paid');
});

test('returns 500 for a database timeout, then safely processes the retry', async () => {
  const order = await newOrder();
  store.failNextEvent = true;
  const id = 'evt_retry_after_error';
  const first = await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded', { id });
  expect(first.status()).toBe(500);
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('pending');
  const second = await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded', { id });
  expect(second.status()).toBe(200);
  expect((await second.json()).status).toBe('processed');
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('paid');
});

test('does not accept a webhook with the wrong payment amount', async () => {
  const order = await newOrder();
  const response = await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded', { amount: 5000 });
  expect(response.status()).toBe(500);
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('pending');
});

test('a delayed failure event cannot undo a successful payment', async () => {
  const order = await newOrder();
  expect((await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded')).status()).toBe(200);
  expect((await sendWebhook(order.paymentIntentId, 'payment_intent.payment_failed')).status()).toBe(200);
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('paid');
});

test('a failed payment can later succeed after another attempt', async () => {
  const order = await newOrder();
  expect((await sendWebhook(order.paymentIntentId, 'payment_intent.payment_failed')).status()).toBe(200);
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('payment_failed');
  expect((await sendWebhook(order.paymentIntentId, 'payment_intent.succeeded')).status()).toBe(200);
  expect((await (await api.get(`/orders/${order.orderId}`)).json()).status).toBe('paid');
});

test('ignores unrelated Stripe events with valid signatures', async () => {
  const order = await newOrder();
  const response = await sendWebhook(order.paymentIntentId, 'customer.created');
  expect(response.status()).toBe(200);
  expect((await response.json()).status).toBe('ignored');
});
