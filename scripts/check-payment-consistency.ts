
import 'dotenv/config';
import Stripe from 'stripe';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!databaseUrl || !stripeKey?.startsWith('sk_test_')) {
  throw new Error('Test-mode Stripe key and DATABASE_URL are required');
}

const pool = new Pool({ connectionString: databaseUrl });
const stripe = new Stripe(stripeKey);

try {
  const database = await pool.query('SELECT current_database() AS name');

  if (database.rows[0].name !== 'payment_lab') {
    throw new Error('Expected payment_lab database');
  }

  const result = await pool.query(`
    SELECT id, status, amount, currency, stripe_payment_intent_id
    FROM orders
    WHERE stripe_payment_intent_id IS NOT NULL
    ORDER BY id
  `);

  let mismatches = 0;

  for (const order of result.rows) {
    const payment = await stripe.paymentIntents.retrieve(
      order.stripe_payment_intent_id
    );

    const problems: string[] = [];

    if (Number(order.amount) !== payment.amount) {
      problems.push('Amount mismatch');
    }

    if (order.currency !== payment.currency) {
      problems.push('Currency mismatch');
    }

    if (payment.status === 'succeeded' && order.status !== 'paid') {
      problems.push('Stripe succeeded, but order is not paid');
    }

    if (payment.status !== 'succeeded' && order.status === 'paid') {
      problems.push('Order is paid, but Stripe payment is not succeeded');
    }

    if (problems.length > 0) {
      mismatches++;
    }

    console.log({
      orderId: order.id,
      stripeStatus: payment.status,
      orderStatus: order.status,
      problems
    });
  }

  console.log(`Checked: ${result.rows.length}, mismatches: ${mismatches}`);

  if (mismatches > 0) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
