
import 'dotenv/config';
import { Pool } from 'pg';
import { test, expect } from './fixtures/stripe-test.js';
import { PostgresOrderStore } from '../src/postgres-store.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is missing');
}

const url = new URL(databaseUrl);

// Prevent connections to remote databases.
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('Tests require a local PostgreSQL database');
}

url.pathname = '/payment_lab_test';

const pool = new Pool({ connectionString: url.toString() });

test.beforeAll(async () => {
  const result = await pool.query('SELECT current_database() AS name');

  expect(result.rows[0].name).toBe('payment_lab_test');
});

test.afterAll(async () => {
  await pool.end();
});

test('detects a succeeded Stripe payment with a pending database order', async ({ stripeApi }) => {
  const store = new PostgresOrderStore(pool);
  let orderId: string | undefined;

  try {
    // 1. Create a pending order in PostgreSQL.
    const order = await store.createOrder(1000);
    orderId = order.id;

    expect(order.status).toBe('pending');

    // 2. Create a real PaymentIntent in Stripe Sandbox.
    const createResponse = await stripeApi.createPaymentIntent({
      amount: 1000,
      currency: 'gbp'
    });

    expect(createResponse.status()).toBe(200);

    const createdPayment = await createResponse.json();

    // 3. Link the Stripe PaymentIntent to our order.
    await store.linkPaymentIntent(order.id, createdPayment.id);

    // 4. Confirm the payment successfully.
    const confirmResponse = await stripeApi.confirmPaymentIntent(
      createdPayment.id
    );

    expect(confirmResponse.status()).toBe(200);

    const confirmedPayment = await confirmResponse.json();

    expect(confirmedPayment.status).toBe('succeeded');
    expect(confirmedPayment.livemode).toBe(false);

    // 5. Retrieve the actual payment status from Stripe.
    const stripeResponse = await stripeApi.retrievePaymentIntent(
      createdPayment.id
    );

    expect(stripeResponse.status()).toBe(200);

    const stripePayment = await stripeResponse.json();

    // 6. Read the actual order status from PostgreSQL.
    const databaseResponse = await pool.query(
      `SELECT status, amount, currency, stripe_payment_intent_id
       FROM orders
       WHERE id = $1`,
      [order.id]
    );

    expect(databaseResponse.rows).toHaveLength(1);

    const databaseOrder = databaseResponse.rows[0];

    // 7. Verify payment identity, amount and currency.
    expect(databaseOrder.stripe_payment_intent_id).toBe(stripePayment.id);
    expect(Number(databaseOrder.amount)).toBe(stripePayment.amount);
    expect(databaseOrder.currency).toBe(stripePayment.currency);

    // 8. Verify the deliberately inconsistent states.
    expect(stripePayment.status).toBe('succeeded');
    expect(databaseOrder.status).toBe('pending');

    // 9. Detect the inconsistency.
    const problems: string[] = [];

    if (stripePayment.status === 'succeeded' && databaseOrder.status !== 'paid') {
      problems.push('Stripe succeeded, but order is not paid');
    }

    expect(problems).toContain(
      'Stripe succeeded, but order is not paid'
    );

    // 10. Verify no webhook event was recorded in the test database.
    const events = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM webhook_events
       WHERE stripe_payment_intent_id = $1`,
      [stripePayment.id]
    );

    expect(events.rows[0].total).toBe(0);

    console.log({
      stripeStatus: stripePayment.status,
      orderStatus: databaseOrder.status,
      problems
    });

  } finally {
    // Clean up only records belonging to this test.
    if (orderId) {
      await pool.query(
        `DELETE FROM webhook_events
         WHERE stripe_payment_intent_id = (
           SELECT stripe_payment_intent_id FROM orders WHERE id = $1
         )`,
        [orderId]
      );

      await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
    }
  }
});
