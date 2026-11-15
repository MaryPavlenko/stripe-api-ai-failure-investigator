#!/usr/bin/env bash
set -euo pipefail
if [[ "${STRIPE_SECRET_KEY:-}" != sk_test_* ]]; then
  echo "ERROR: Export a Stripe sandbox sk_test_ secret key; live keys are blocked." >&2
  exit 2
fi
curl -sS -G "https://api.stripe.com/v1/events" \
  -H "Authorization: Bearer ${STRIPE_SECRET_KEY}" \
  --data-urlencode "limit=3"
