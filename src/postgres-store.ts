import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { EventResult, Order, OrderStore, PaymentEvent } from './types.js';

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    amount: Number(row.amount),
    currency: 'gbp',
    status: row.status as Order['status'],
    stripePaymentIntentId: row.stripe_payment_intent_id as string | null
  };
}

export class PostgresOrderStore implements OrderStore {
  constructor(private pool: Pool) {}

  async createOrder(amount: number): Promise<Order> {
    const id = randomUUID();
    const result = await this.pool.query(
      'INSERT INTO orders (id, amount, currency) VALUES ($1, $2, $3) RETURNING *',
      [id, amount, 'gbp']
    );
    return rowToOrder(result.rows[0]);
  }

  async getOrder(id: string): Promise<Order | null> {
    const result = await this.pool.query('SELECT * FROM orders WHERE id::text = $1', [id]);
    return result.rows.length ? rowToOrder(result.rows[0]) : null;
  }

  async linkPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
    const result = await this.pool.query(
      'UPDATE orders SET stripe_payment_intent_id = $2 WHERE id = $1 AND stripe_payment_intent_id IS NULL',
      [orderId, paymentIntentId]
    );
    if (result.rowCount !== 1) throw new Error('Could not link PaymentIntent to order');
  }

  async applyPaymentEvent(event: PaymentEvent): Promise<EventResult> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO webhook_events (id, event_type, stripe_payment_intent_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id',
        [event.id, event.type, event.paymentIntentId]
      );
      if (inserted.rowCount === 0) {
        await client.query('COMMIT');
        return 'duplicate';
      }

      // Match the PaymentIntent AND its expected amount/currency before changing an order.
      const orderResult = await client.query(
        'SELECT id, status FROM orders WHERE stripe_payment_intent_id = $1 AND amount = $2 AND currency = $3 FOR UPDATE',
        [event.paymentIntentId, event.amount, event.currency]
      );
      if (orderResult.rowCount !== 1) {
        throw new Error('No matching order for PaymentIntent, amount and currency');
      }
      const orderId = orderResult.rows[0].id as string;
      if (event.type === 'payment_intent.succeeded') {
        await client.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, 'paid']);
      } else {
        // A delayed failure must not overwrite an already successful payment.
        await client.query(
          "UPDATE orders SET status = 'payment_failed' WHERE id = $1 AND status <> 'paid'",
          [orderId]
        );
      }

      await client.query('COMMIT');
      return 'processed';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error; // Stripe can retry after a 500 response.
    } finally {
      client.release();
    }
  }
}
