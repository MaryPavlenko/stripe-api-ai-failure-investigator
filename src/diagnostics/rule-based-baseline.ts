
import type { IncidentReport } from './incident-report.js';

type EvidenceObject = Record<string, unknown>;

function asObject(value: unknown): EvidenceObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as EvidenceObject;
  }

  return {};
}

export function diagnoseWithRules(evidence: unknown): IncidentReport {
  const data = asObject(evidence);

  const order = asObject(data.order);
  const webhook = asObject(data.webhook);
  const firstDelivery = asObject(data.first_delivery);
  const retry = asObject(data.retry);
  const secondDelivery = asObject(data.second_delivery);
  const firstEvent = asObject(data.first_event);
  const secondEvent = asObject(data.second_event);
  const stripe = asObject(data.stripe);
  const database = asObject(data.database);
  const webhooks = asObject(data.webhooks);

  // Rule 1: Order and webhook amounts are inconsistent.
  if (
    typeof order.amount_pence === 'number' &&
    typeof webhook.amount_pence === 'number' &&
    order.amount_pence !== webhook.amount_pence &&
    order.currency === webhook.currency &&
    webhook.http_status === 500
  ) {
    return {
      decision: 'root_cause_identified',
      summary: 'The webhook payment amount differs from the stored order amount.',
      failureCategory: 'payment_data_inconsistency',
      probableRootCause: 'webhook_payment_amount_mismatch',
      confidence: 'high',
      supportingEvidence: [
        `Order amount: ${order.amount_pence} pence`,
        `Webhook amount: ${webhook.amount_pence} pence`,
        'Webhook HTTP status: 500'
      ],
      recommendations: [
        'Verify the amount in the incoming webhook.',
        'Check the order amount against the associated PaymentIntent.',
        'Review how the application handles mismatched payment data.'
      ]
    };
  }

  // Rule 2: The same webhook event is processed more than once.
  if (
    firstDelivery.processing_result === 'processed' &&
    secondDelivery.processing_result === 'processed' &&
    secondDelivery.same_event_id === true &&
    typeof data.observed_processing_count === 'number' &&
    data.observed_processing_count > 1
  ) {
    return {
      decision: 'insufficient_evidence',
      summary: 'The same webhook event was processed more than once.',
      failureCategory: 'idempotency_failure',
      probableRootCause: null,
      confidence: 'medium',
      supportingEvidence: [
        'Both webhook deliveries returned processed.',
        'The same event ID was used for both deliveries.',
        `Observed processing count: ${data.observed_processing_count}`
      ],
      recommendations: [
        'Check webhook event ID deduplication.',
        'Inspect event processing and persistence logic.',
        'Verify that repeated delivery cannot cause repeated business operations.'
      ]
    };
  }

  // Rule 3: A later failure event changes an already paid order.
  if (
    firstEvent.type === 'payment_intent.succeeded' &&
    firstEvent.order_status === 'paid' &&
    secondEvent.type === 'payment_intent.payment_failed' &&
    secondEvent.order_status === 'payment_failed'
  ) {
    return {
      decision: 'insufficient_evidence',
      summary: 'A paid order changed to payment_failed after a later webhook.',
      failureCategory: 'incorrect_payment_state_transition',
      probableRootCause: null,
      confidence: 'medium',
      supportingEvidence: [
        'Order status after success: paid',
        'A subsequent payment failure event was processed.',
        'Final order status: payment_failed'
      ],
      recommendations: [
        'Review allowed payment status transitions.',
        'Check handling of delayed and out-of-order webhooks.',
        'Verify the authoritative payment state before overwriting a paid order.'
      ]
    };
  }

  // Rule 4: Stripe succeeded but the database order is pending.
  if (
    stripe.payment_status === 'succeeded' &&
    database.order_status === 'pending' &&
    database.payment_intent_matches === true &&
    database.amount_matches === true &&
    database.currency_matches === true
  ) {
    return {
      decision: 'insufficient_evidence',
      summary: 'Stripe reports a successful payment, but the database order remains pending.',
      failureCategory: 'payment_state_inconsistency',
      probableRootCause: null,
      confidence: 'medium',
      supportingEvidence: [
        'Stripe payment status: succeeded',
        'Database order status: pending',
        'PaymentIntent ID, amount and currency match',
        `Recorded webhook events: ${String(webhooks.recorded_event_count)}`
      ],
      recommendations: [
        'Inspect Stripe webhook delivery history.',
        'Check application webhook processing logs.',
        'Verify that payment events are persisted and applied to the database.'
      ]
    };
  }

  // Rule 5: The webhook failed initially but succeeded on retry.
  if (
    firstDelivery.http_status === 500 &&
    firstDelivery.order_status === 'pending' &&
    retry.same_event_id === true &&
    retry.http_status === 200 &&
    retry.order_status === 'paid'
  ) {
    return {
      decision: 'insufficient_evidence',
      summary: 'Webhook processing initially failed but succeeded on retry.',
      failureCategory: 'transient_processing_failure',
      probableRootCause: null,
      confidence: 'medium',
      supportingEvidence: [
        'First delivery returned HTTP 500.',
        'The order remained pending after the first attempt.',
        'Retry returned HTTP 200 and the order became paid.'
      ],
      recommendations: [
        'Inspect application errors from the first delivery.',
        'Check database availability and event processing failures.',
        'Verify retry safety and idempotency.'
      ]
    };
  }

  // Fallback: no rule matches the available evidence.
  return {
    decision: 'insufficient_evidence',
    summary: 'The available evidence does not match a known diagnostic rule.',
    failureCategory: null,
    probableRootCause: null,
    confidence: 'low',
    supportingEvidence: [],
    recommendations: [
      'Collect additional application logs and relevant event data.',
      'Investigate the incident manually.'
    ]
  };
}
