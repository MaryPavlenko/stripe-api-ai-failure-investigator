# Sandbox API exercises

Scripts for **manual, sandbox-only API exploration**, not Playwright tests. Start with [`docs/ru/02-sandbox-api-exploration.md`](../../docs/ru/02-sandbox-api-exploration.md).

Run from repository root, after locally exporting `STRIPE_SECRET_KEY` from a trusted `.env`. Scripts reject keys without an `sk_test_` prefix. Do not print or commit credentials, do not use real card details, and be careful sharing JSON responses containing `client_secret` values.

Suggested order: list PaymentIntents → create unconfirmed PaymentIntent → GET by its ID → intentionally invalid amount → list events.
