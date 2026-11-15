#!/usr/bin/env bash
set -euo pipefail
if [[ "${STRIPE_SECRET_KEY:-}" != sk_test_* ]]; then
  echo "ERROR: Export a Stripe sandbox sk_test_ secret key; live keys are blocked." >&2
  exit 2
fi
# Creates an UNCONFIRMED sandbox object. No actual card charge.
curl -sS -X POST "https://api.stripe.com/v1/payment_intents" \
  -H "Authorization: Bearer ${STRIPE_SECRET_KEY}" \
  -d "amount=1000" \
  -d "currency=gbp" \
  -d "automatic_payment_methods[enabled]=true"
