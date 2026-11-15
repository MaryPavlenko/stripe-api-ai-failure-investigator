
import { test, expect } from '@playwright/test';
import { sanitiseEvidence } from '../src/diagnostics/sanitise-evidence.js';
import type { IncidentEvidence } from '../src/diagnostics/incident-evidence.js';

function createEvidence(): IncidentEvidence {
  return {
    incidentId: 'inc_001',
    testName: 'Payment test for customer@example.com',
    collectedAt: '2026-11-15T12:00:00Z',

    stripe: {
      paymentStatus: 'failed',
      responseHttpStatus: 400
    },

    database: {
      orderStatus: 'pending',
      paymentIntentMatches: true,
      amountMatches: true,
      currencyMatches: true
    },

    webhooks: {
      recordedEventCount: 0,
      deliveryHttpStatus: null
    },

    application: {
      logs: [
        'Stripe key: sk_test_FAKE123456',
        'Authorization: Bearer abc123token',
        'Webhook secret: whsec_FAKE123456',
        'Client secret: pi_123ABC_secret_XYZ456',
        'Customer email: customer@example.com'
      ],
      errors: [
        'Payment failed for admin@example.com'
      ]
    }
  };
}

test('removes secrets and personal data from evidence', () => {
  const evidence = createEvidence();
  const sanitised = sanitiseEvidence(evidence);
  const output = JSON.stringify(sanitised);

  expect(output).not.toContain('sk_test_FAKE123456');
  expect(output).not.toContain('abc123token');
  expect(output).not.toContain('whsec_FAKE123456');
  expect(output).not.toContain('pi_123ABC_secret_XYZ456');
  expect(output).not.toContain('customer@example.com');
  expect(output).not.toContain('admin@example.com');

  expect(output).toContain('[REDACTED_STRIPE_KEY]');
  expect(output).toContain('[REDACTED_TOKEN]');
  expect(output).toContain('[REDACTED_WEBHOOK_SECRET]');
  expect(output).toContain('[REDACTED_CLIENT_SECRET]');
  expect(output).toContain('[REDACTED_EMAIL]');
});

test('preserves useful diagnostic information', () => {
  const sanitised = sanitiseEvidence(createEvidence());

  expect(sanitised.stripe.paymentStatus).toBe('failed');
  expect(sanitised.stripe.responseHttpStatus).toBe(400);
  expect(sanitised.database.orderStatus).toBe('pending');
  expect(sanitised.webhooks.recordedEventCount).toBe(0);
});

test('does not modify the original evidence', () => {
  const evidence = createEvidence();

  sanitiseEvidence(evidence);

  expect(evidence.application.logs?.[0]).toContain(
    'sk_test_FAKE123456'
  );
  expect(evidence.testName).toContain('customer@example.com');
});

test('handles missing application logs', () => {
  const evidence = createEvidence();

  evidence.application.logs = null;
  evidence.application.errors = null;

  const sanitised = sanitiseEvidence(evidence);

  expect(sanitised.application.logs).toBeNull();
  expect(sanitised.application.errors).toBeNull();
});

test('redacts sensitive fields in nested objects and arrays', () => {
  const evidence = createEvidence();

  const nestedEvidence = {
    ...evidence,

    api: {
      headers: {
        authorization: 'Bearer fake-token-123',
        'x-api-key': 'arbitrary-secret-value'
      },

      customer: {
        email: 'nested@example.com',
        password: 'plain-password-123'
      }
    },

    events: [
      {
        status: 'received',
        access_token: 'another-secret-value'
      }
    ]
  };

  const sanitised = sanitiseEvidence(nestedEvidence);
  const output = JSON.stringify(sanitised);

  // Sensitive values must be removed.
  expect(output).not.toContain('fake-token-123');
  expect(output).not.toContain('arbitrary-secret-value');
  expect(output).not.toContain('nested@example.com');
  expect(output).not.toContain('plain-password-123');
  expect(output).not.toContain('another-secret-value');

  // Sensitive fields must be redacted.
  expect(output).toContain('"authorization":"[REDACTED]"');
  expect(output).toContain('"password":"[REDACTED]"');
  expect(output).toContain('"access_token":"[REDACTED]"');

  // Useful evidence must remain available.
  expect(output).toContain('"status":"received"');
  expect(sanitised.stripe.responseHttpStatus).toBe(400);

  // The original evidence must remain unchanged.
  expect(nestedEvidence.api.customer.password).toBe(
    'plain-password-123'
  );
});
