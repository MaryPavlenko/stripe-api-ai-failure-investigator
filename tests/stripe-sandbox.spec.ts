import { test, expect } from './fixtures/stripe-test.js';

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
