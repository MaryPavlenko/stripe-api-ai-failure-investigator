import 'dotenv/config';
import pg from 'pg';
import { createApp } from './app.js';
import { PostgresOrderStore } from './postgres-store.js';
import { StripePaymentGateway } from './stripe-payments.js';

const key = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const port = Number(process.env.PORT || 4242);

if (!key?.startsWith('sk_test_') || !webhookSecret?.startsWith('whsec_') || !databaseUrl) {
  throw new Error('Configure STRIPE_SECRET_KEY (test mode), STRIPE_WEBHOOK_SECRET and DATABASE_URL in .env');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');

const pool = new pg.Pool({ connectionString: databaseUrl });
await pool.query('SELECT 1');
const store = new PostgresOrderStore(pool);
const gateway = new StripePaymentGateway(key, webhookSecret);
const app = createApp(store, gateway);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Payment lab running on http://127.0.0.1:${port}`);
});

function stop() {
  server.close(() => void pool.end());
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
