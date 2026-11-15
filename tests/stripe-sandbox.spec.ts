import { test, expect } from './fixtures/stripe-test.js';
import { randomUUID } from 'node:crypto';

test('creates, retrieves and cancels a Stripe Sandbox PaymentIntent', async ({
  stripeApi,
  testPaymentIntent
}) => {
  test.setTimeout(45_000);

  // Check the PaymentIntent created by the fixture
  expect(testPaymentIntent.id).toMatch(/^pi_/);
  expect(testPaymentIntent.amount).toBe(1000);
  expect(testPaymentIntent.currency).toBe('gbp');
  expect(testPaymentIntent.status).toBe('requires_payment_method');
  expect(testPaymentIntent.livemode).toBe(false);

  // Retrieve the same PaymentIntent
  const response = await stripeApi.retrievePaymentIntent(
    testPaymentIntent.id
  );

  expect(response.status()).toBe(200);

  const retrieved = await response.json();

  // Compare the retrieved data with the created object
  expect(retrieved.id).toBe(testPaymentIntent.id);
  expect(retrieved.amount).toBe(testPaymentIntent.amount);
  expect(retrieved.currency).toBe(testPaymentIntent.currency);
  expect(retrieved.status).toBe(testPaymentIntent.status);
  expect(retrieved.livemode).toBe(false);

  // Cleanup is handled automatically by the fixture
});


test('confirms a Stripe Sandbox payment successfully', async ({ stripeApi }) => {
  test.setTimeout(45_000);

  // 1. Create a PaymentIntent
  const createResponse = await stripeApi.createPaymentIntent({
    amount: 1000,
    currency: 'gbp'
  });

  expect(createResponse.status()).toBe(200);

  const created = await createResponse.json();

  expect(created.status).toBe('requires_payment_method');

  // 2. Confirm the payment using a test Visa card
  const confirmResponse = await stripeApi.confirmPaymentIntent(created.id);

  expect(confirmResponse.status()).toBe(200);

  const confirmed = await confirmResponse.json();

  expect(confirmed.id).toBe(created.id);
  expect(confirmed.status).toBe('succeeded');
  expect(confirmed.amount_received).toBe(1000);
  expect(confirmed.livemode).toBe(false);

  // 3. Retrieve the PaymentIntent and verify its final status
  const retrieveResponse = await stripeApi.retrievePaymentIntent(created.id);

  expect(retrieveResponse.status()).toBe(200);

  const retrieved = await retrieveResponse.json();

  expect(retrieved.id).toBe(created.id);
  expect(retrieved.status).toBe('succeeded');
  expect(retrieved.amount).toBe(1000);
  expect(retrieved.currency).toBe('gbp');
});


test('rejects a declined Stripe Sandbox payment', async ({
  stripeApi,
  testPaymentIntent
}) => {
  test.setTimeout(45_000);

  // 1. Confirm payment with a card that will be declined
  const confirmResponse = await stripeApi.confirmPaymentIntent(
    testPaymentIntent.id,
    'pm_card_visa_chargeDeclined'
  );

  expect(confirmResponse.status()).toBe(402);

  const result = await confirmResponse.json();

  // 2. Verify the decline reason
  expect(result.error.type).toBe('card_error');
  expect(result.error.code).toBe('card_declined');
  expect(result.error.decline_code).toBe('generic_decline');

  // 3. Retrieve PaymentIntent after the decline
  const retrieveResponse = await stripeApi.retrievePaymentIntent(
    testPaymentIntent.id
  );

  expect(retrieveResponse.status()).toBe(200);

  const retrieved = await retrieveResponse.json();

  // 4. Verify that no payment was completed
  expect(retrieved.id).toBe(testPaymentIntent.id);
  expect(retrieved.status).toBe('requires_payment_method');
  expect(retrieved.amount_received).toBe(0);
  expect(retrieved.last_payment_error.code).toBe('card_declined');
});


test('rejects an invalid negative amount', async ({ stripeApi }) => {
  const response = await stripeApi.createPaymentIntent({
    amount: -100,
    currency: 'gbp'
  });

  expect(response.status()).toBe(400);

  const result = await response.json();

  expect(result.error.type).toBe('invalid_request_error');
  expect(result.error.param).toBe('amount');
});

test('rejects an invalid currency', async ({ stripeApi }) => {
  const response = await stripeApi.createPaymentIntent({
    amount: 1000,
    currency: 'not_a_currency'
  });

  expect(response.status()).toBe(400);

  const result = await response.json();

  expect(result.error.type).toBe('invalid_request_error');
  expect(result.error.param).toBe('currency');
});


test('rejects GBP amount below the minimum (29p)', async ({ stripeApi }) => {
  const response = await stripeApi.createPaymentIntent({
    amount: 29,
    currency: 'gbp'
  });

  expect(response.status()).toBe(400);

  const result = await response.json();
  expect(result.error.type).toBe('invalid_request_error');
  expect(result.error.code).toBe('amount_too_small');
});

for (const amount of [30, 31]) {
  test(`accepts GBP amount of ${amount}p`, async ({ stripeApi }) => {
    const response = await stripeApi.createPaymentIntent({
      amount,
      currency: 'gbp'
    });

    expect(response.status()).toBe(200);

    const intent = await response.json();

    try {
      expect(intent.amount).toBe(amount);
      expect(intent.currency).toBe('gbp');
      expect(intent.status).toBe('requires_payment_method');
      expect(intent.livemode).toBe(false);
    } finally {
      const cancelResponse = await stripeApi.cancelPaymentIntent(intent.id);

      expect(cancelResponse.status()).toBe(200);
    }
  });
}

test('cancels a Stripe Sandbox PaymentIntent', async ({ stripeApi }) => {
  test.setTimeout(45_000);

  // 1. Create a PaymentIntent
  const createResponse = await stripeApi.createPaymentIntent({
    amount: 1000,
    currency: 'gbp'
  });

  expect(createResponse.status()).toBe(200);

  const created = await createResponse.json();

  expect(created.status).toBe('requires_payment_method');

  // 2. Cancel the PaymentIntent
  const cancelResponse = await stripeApi.cancelPaymentIntent(created.id);

  expect(cancelResponse.status()).toBe(200);

  const cancelled = await cancelResponse.json();

  expect(cancelled.id).toBe(created.id);
  expect(cancelled.status).toBe('canceled');

  // 3. Retrieve and verify the final status
  const retrieveResponse = await stripeApi.retrievePaymentIntent(created.id);

  expect(retrieveResponse.status()).toBe(200);

  const retrieved = await retrieveResponse.json();

  expect(retrieved.id).toBe(created.id);
  expect(retrieved.status).toBe('canceled');
  expect(retrieved.amount_received).toBe(0);
});

test('refunds a Stripe Sandbox payment in full', async ({ stripeApi }) => {
  test.setTimeout(45_000);

  // 1. Create a £10 PaymentIntent
  const createResponse = await stripeApi.createPaymentIntent({
    amount: 1000,
    currency: 'gbp'
  });

  expect(createResponse.status()).toBe(200);

  const created = await createResponse.json();

  expect(created.status).toBe('requires_payment_method');

  // 2. Confirm payment using a test Visa card
  const confirmResponse = await stripeApi.confirmPaymentIntent(created.id);

  expect(confirmResponse.status()).toBe(200);

  const confirmed = await confirmResponse.json();
  expect(confirmed.livemode).toBe(false);

  expect(confirmed.status).toBe('succeeded');
  expect(confirmed.amount_received).toBe(1000);

  // 3. Refund the full amount
  const refundResponse = await stripeApi.createRefund(created.id);

  expect(refundResponse.status()).toBe(200);

  const refund = await refundResponse.json();

  expect(refund.id).toMatch(/^re_/);
  expect(refund.amount).toBe(1000);
  expect(refund.currency).toBe('gbp');
  expect(refund.payment_intent).toBe(created.id);
  expect(refund.status).toBe('succeeded');
  expect(refund.object).toBe('refund');

  // 4. Retrieve the refund and verify the result
  const retrieveResponse = await stripeApi.retrieveRefund(refund.id);

  expect(retrieveResponse.status()).toBe(200);

  const retrieved = await retrieveResponse.json();

  expect(retrieved.id).toBe(refund.id);
  expect(retrieved.amount).toBe(1000);
  expect(retrieved.currency).toBe('gbp');
  expect(retrieved.payment_intent).toBe(created.id);
  expect(retrieved.status).toBe('succeeded');
});


test('refunds a Stripe Sandbox payment partially', async ({ stripeApi }) => {
  test.setTimeout(45_000);

  // 1. Create a £10 PaymentIntent
  const createResponse = await stripeApi.createPaymentIntent({
    amount: 1000,
    currency: 'gbp'
  });

  expect(createResponse.status()).toBe(200);

  const created = await createResponse.json();

  // 2. Confirm the payment
  const confirmResponse = await stripeApi.confirmPaymentIntent(created.id);

  expect(confirmResponse.status()).toBe(200);

  const confirmed = await confirmResponse.json();

  expect(confirmed.status).toBe('succeeded');
  expect(confirmed.amount_received).toBe(1000);
  expect(confirmed.livemode).toBe(false);

  // 3. Refund only £4
  const refundResponse = await stripeApi.createRefund(created.id, 400);

  expect(refundResponse.status()).toBe(200);

  const refund = await refundResponse.json();

  expect(refund.id).toMatch(/^re_/);
  expect(refund.object).toBe('refund');
  expect(refund.amount).toBe(400);
  expect(refund.currency).toBe('gbp');
  expect(refund.payment_intent).toBe(created.id);
  expect(refund.status).toBe('succeeded');

  // 4. Retrieve the refund
  const retrieveResponse = await stripeApi.retrieveRefund(refund.id);

  expect(retrieveResponse.status()).toBe(200);

  const retrieved = await retrieveResponse.json();

  expect(retrieved.id).toBe(refund.id);
  expect(retrieved.amount).toBe(400);
  expect(retrieved.status).toBe('succeeded');

  // 5. Verify that the original charge is only partially refunded
  expect(confirmed.latest_charge).toMatch(/^ch_/);

  const chargeResponse = await stripeApi.retrieveCharge(
    confirmed.latest_charge
  );

  expect(chargeResponse.status()).toBe(200);

  const charge = await chargeResponse.json();

  expect(charge.amount).toBe(1000);
  expect(charge.amount_refunded).toBe(400);
  expect(charge.refunded).toBe(false);
  expect(charge.payment_intent).toBe(created.id);
});


test('prevents duplicate PaymentIntents with an idempotency key', async ({
  stripeApi
}) => {
  test.setTimeout(45_000);

  const key = `test-create-${randomUUID()}`;
  let paymentIntentId: string | undefined;

  try {
    // 1. Create a PaymentIntent with an idempotency key
    const firstResponse = await stripeApi.createPaymentIntent(
      { amount: 1000, currency: 'gbp' },
      key
    );

    expect(firstResponse.status()).toBe(200);

    const first = await firstResponse.json();
    paymentIntentId = first.id;

    expect(first.id).toMatch(/^pi_/);
    expect(first.amount).toBe(1000);

    // 2. Repeat the same request with the same key
    const retryResponse = await stripeApi.createPaymentIntent(
      { amount: 1000, currency: 'gbp' },
      key
    );

    expect(retryResponse.status()).toBe(200);

    const retried = await retryResponse.json();

    // Stripe must return the original PaymentIntent
    expect(retried.id).toBe(first.id);
    expect(retried.amount).toBe(1000);

    // 3. Reuse the key with different parameters
    const differentResponse = await stripeApi.createPaymentIntent(
      { amount: 1200, currency: 'gbp' },
      key
    );

    expect(differentResponse.status()).toBe(400);

    const result = await differentResponse.json();

    expect(result.error.type).toBe('idempotency_error');

  } finally {
    // 4. Cancel the original PaymentIntent
    if (paymentIntentId) {
      const cancelResponse = await stripeApi.cancelPaymentIntent(
        paymentIntentId
      );

      expect(cancelResponse.status()).toBe(200);
    }
  }
});

test('handles PaymentIntent status transitions after decline and retry', async ({
  stripeApi
}) => {
  test.setTimeout(45_000);

  // 1. Create a PaymentIntent
  const createResponse = await stripeApi.createPaymentIntent({
    amount: 1000,
    currency: 'gbp'
  });

  expect(createResponse.status()).toBe(200);

  const created = await createResponse.json();

  expect(created.status).toBe('requires_payment_method');

  // 2. Attempt payment with a declined test card
  const declineResponse = await stripeApi.confirmPaymentIntent(
    created.id,
    'pm_card_visa_chargeDeclined'
  );

  expect(declineResponse.status()).toBe(402);

  const afterDeclineResponse = await stripeApi.retrievePaymentIntent(created.id);

  expect(afterDeclineResponse.status()).toBe(200);

  const afterDecline = await afterDeclineResponse.json();

  expect(afterDecline.status).toBe('requires_payment_method');
  expect(afterDecline.last_payment_error.code).toBe('card_declined');
  expect(afterDecline.amount_received).toBe(0);

  // 3. Retry the SAME PaymentIntent with a valid test card
  const retryResponse = await stripeApi.confirmPaymentIntent(created.id);

  expect(retryResponse.status()).toBe(200);

  const paid = await retryResponse.json();

  expect(paid.id).toBe(created.id);
  expect(paid.status).toBe('succeeded');
  expect(paid.amount_received).toBe(1000);

  // 4. A succeeded PaymentIntent cannot be canceled
  const cancelResponse = await stripeApi.cancelPaymentIntent(created.id);

  expect(cancelResponse.status()).toBe(400);

  // 5. Verify the failed cancellation did not change its status
  const finalResponse = await stripeApi.retrievePaymentIntent(created.id);

  expect(finalResponse.status()).toBe(200);

  const finalIntent = await finalResponse.json();

  expect(finalIntent.status).toBe('succeeded');
  expect(finalIntent.amount_received).toBe(1000);
  expect(finalIntent.livemode).toBe(false);
});
