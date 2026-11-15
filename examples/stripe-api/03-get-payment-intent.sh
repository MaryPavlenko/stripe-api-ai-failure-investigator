#!/usr/bin/env bash
set -euo pipefail
if [[ "${STRIPE_SECRET_KEY:-}" != sk_test_* ]]; then
  echo "ERROR: Export a Stripe sandbox sk_test_ secret key; live keys are blocked." >&2
  exit 2
fi
intent_id="${1:-}"
if [[ ! "$intent_id" =~ ^pi_[A-Za-z0-9_]+$ ]]; then
  echo "Usage: bash examples/stripe-api/03-get-payment-intent.sh pi_YOUR_ID" >&2
  exit 2
fi
curl -sS "https://api.stripe.com/v1/payment_intents/${intent_id}" \
  -H "Authorization: Bearer ${STRIPE_SECRET_KEY}"
