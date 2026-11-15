#!/usr/bin/env bash
set -euo pipefail
if [[ "${STRIPE_SECRET_KEY:-}" != sk_test_* ]]; then
  echo "ERROR: Export a Stripe sandbox sk_test_ secret key; live keys are blocked." >&2
  exit 2
fi
# A negative test; expect HTTP 4xx + a JSON error response.
curl -sS -i -X POST "https://api.stripe.com/v1/payment_intents" \
  -H "Authorization: Bearer ${STRIPE_SECRET_KEY}" \
  -d "amount=-100" -d "currency=gbp" \
  -d "automatic_payment_methods[enabled]=true"
