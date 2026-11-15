
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { writeFile } from 'node:fs/promises';
import type { APIRequestContext } from '@playwright/test';
import Stripe from 'stripe';
import { FaultyLateFailureStore } from './helpers/faulty-late-failure-store.js';

import { test, expect } from './fixtures/evidence-test.js';
import { FaultyDedupStore } from './helpers/faulty-dedup-store.js';
import { createApp } from '../src/app.js';
import type { Order, PaymentGateway } from '../src/types.js';

const TEST_WEBHOOK_SECRET = 'whsec_local_example_for_automated_tests';
const stripe = new Stripe('sk_test_local_not_a_real_key');

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

test('F002 captures duplicate webhook processing', async ({ playwright }, testInfo) => {
  const store = new FaultyDedupStore();
  const server = createApp(store, new FakePaymentGateway())
    .listen(0, '127.0.0.1');

  let api: APIRequestContext | undefined;

  try {
    await once(server, 'listening');

    const port = (server.address() as AddressInfo).port;

    api = await playwright.request.newContext({
      baseURL: `http://127.0.0.1:${port}`
    });

    // 1. Create a pending order.
    const createResponse = await api.post('/orders', {
      data: { amount: 1000, currency: 'gbp' }
    });

    expect(createResponse.status()).toBe(201);

    const order = await createResponse.json();

    // 2. Prepare one signed webhook event.
    const payload = JSON.stringify({
      id: 'evt_F002',
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

    const sendWebhook = () => api!.post('/webhooks/stripe', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature
      }
    });

    // 3. First delivery.
    const first = await sendWebhook();
    const firstResult = await first.json();

    expect(first.status()).toBe(200);
    expect(firstResult.status).toBe('processed');

    // 4. Deliver the exact same event again.
    const second = await sendWebhook();
    const secondResult = await second.json();

    // 5. Verify the deliberately injected defect.
    expect(second.status()).toBe(200);
    expect(secondResult.status).toBe('processed');
    expect(store.processingCount).toBe(2);

    // 6. Collect observed diagnostic facts.
    const scenarioEvidence = {
      scenario_id: 'F002',
      event_type: 'payment_intent.succeeded',

      first_delivery: {
        http_status: first.status(),
        processing_result: firstResult.status
      },

      second_delivery: {
        same_event_id: true,
        http_status: second.status(),
        processing_result: secondResult.status
      },

      observed_processing_count: store.processingCount
    };

    // 7. Export allowlisted evidence without ground truth.
    const evidencePath = testInfo.outputPath('F002-evidence.json');

    await writeFile(
      evidencePath,
      JSON.stringify(scenarioEvidence, null, 2),
      'utf8'
    );

    await testInfo.attach('F002-evidence.json', {
      path: evidencePath,
      contentType: 'application/json'
    });

  } finally {
    if (api) {
      await api.dispose();
    }

    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

test('F004 captures incorrect payment status after delayed failure webhook', async ({ playwright }, testInfo) => {
  const store = new FaultyLateFailureStore();

  const server = createApp(store, new FakePaymentGateway())
    .listen(0, '127.0.0.1');

  let api: APIRequestContext | undefined;

  try {
    await once(server, 'listening');

    const port = (server.address() as AddressInfo).port;

    api = await playwright.request.newContext({
      baseURL: `http://127.0.0.1:${port}`
    });

    // 1. Create a pending order.
    const createResponse = await api.post('/orders', {
      data: { amount: 1000, currency: 'gbp' }
    });

    expect(createResponse.status()).toBe(201);

    const order = await createResponse.json();

    expect(order.status).toBe('pending');

    // 2. Helper for sending signed webhook events.
    const sendEvent = async (
      eventId: string,
      eventType: 'payment_intent.succeeded' | 'payment_intent.payment_failed'
    ) => {
      const payload = JSON.stringify({
        id: eventId,
        object: 'event',
        type: eventType,
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

      return api!.post('/webhooks/stripe', {
        data: payload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature
        }
      });
    };

    // 3. Process successful payment.
    const successEventId = 'evt_F004_success';

    const successResponse = await sendEvent(
      successEventId,
      'payment_intent.succeeded'
    );

    expect(successResponse.status()).toBe(200);

    const firstOrderResponse = await api.get(
      `/orders/${order.orderId}`
    );

    expect(firstOrderResponse.status()).toBe(200);

    const orderAfterSuccess = await firstOrderResponse.json();

    expect(orderAfterSuccess.status).toBe('paid');

    // 4. Process a delayed failure event.
    const failureEventId = 'evt_F004_late_failure';

    const failureResponse = await sendEvent(
      failureEventId,
      'payment_intent.payment_failed'
    );

    expect(failureResponse.status()).toBe(200);

    const finalOrderResponse = await api.get(
      `/orders/${order.orderId}`
    );

    expect(finalOrderResponse.status()).toBe(200);

    const orderAfterFailure = await finalOrderResponse.json();

    // 5. Verify the deliberately injected defect.
    expect(orderAfterFailure.status).toBe('payment_failed');

    // 6. Collect observed facts without ground truth.
    const scenarioEvidence = {
      scenario_id: 'F004',

      first_event: {
        type: 'payment_intent.succeeded',
        http_status: successResponse.status(),
        order_status: orderAfterSuccess.status
      },

      second_event: {
        type: 'payment_intent.payment_failed',
        different_event_id: true,
        http_status: failureResponse.status(),
        order_status: orderAfterFailure.status
      },

      application_error: null
    };

    // 7. Export allowlisted diagnostic evidence.
    const evidencePath = testInfo.outputPath('F004-evidence.json');

    await writeFile(
      evidencePath,
      JSON.stringify(scenarioEvidence, null, 2),
      'utf8'
    );

    await testInfo.attach('F004-evidence.json', {
      path: evidencePath,
      contentType: 'application/json'
    });

  } finally {
    if (api) {
      await api.dispose();
    }

    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});
