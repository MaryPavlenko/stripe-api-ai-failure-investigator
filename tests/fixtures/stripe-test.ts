import 'dotenv/config';
import { test as base, expect } from './evidence-test.js';
import { StripeApiClient } from '../helpers/stripe-api-client.js';

type TestPaymentIntent = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  livemode: boolean;
};

type StripeFixtures = {
  stripeApi: StripeApiClient;
  testPaymentIntent: TestPaymentIntent;
};

export const test = base.extend<StripeFixtures>({
  stripeApi: async ({ playwright }, use) => {
    const apiKey = process.env.STRIPE_SECRET_KEY;

    if (!apiKey?.startsWith('sk_test_')) {
      throw new Error('A Stripe test API key is required');
    }

    const context = await playwright.request.newContext({
      baseURL: 'https://api.stripe.com',
      extraHTTPHeaders: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    try {
      await use(new StripeApiClient(context));
    } finally {
      await context.dispose();
    }
  },

  testPaymentIntent: async ({ stripeApi }, use) => {
    const response = await stripeApi.createPaymentIntent({
      amount: 1000,
      currency: 'gbp'
    });

    expect(response.status()).toBe(200);

    const created = await response.json() as TestPaymentIntent;

    expect(created.id).toMatch(/^pi_/);

    try {
      await use(created);
    } finally {
      if (created.id?.startsWith('pi_')) {
        const cancelResponse = await stripeApi.cancelPaymentIntent(
          created.id
        );

        expect(cancelResponse.status()).toBe(200);

        const cancelled = await cancelResponse.json() as TestPaymentIntent;

        expect(cancelled.id).toBe(created.id);
        expect(cancelled.status).toBe('canceled');
      }
    }
  }
});

export { expect };
