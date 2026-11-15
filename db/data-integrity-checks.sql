
-- Stage 7: SQL Data Integrity Checks
-- Read-only diagnostics for orders and webhook_events.
-- Every returned row represents a potential integrity issue.

WITH integrity_issues AS (

    -- 1. Completed order without a linked PaymentIntent.
    SELECT
        'COMPLETED_ORDER_WITHOUT_PAYMENT_INTENT' AS issue,
        o.id::text AS order_id,
        NULL::text AS event_id
    FROM orders o
    WHERE o.status IN ('paid', 'payment_failed')
      AND o.stripe_payment_intent_id IS NULL

    UNION ALL

    -- 2. Paid order without a recorded success event.
    SELECT
        'PAID_ORDER_MISSING_SUCCESS_EVENT',
        o.id::text,
        NULL::text
    FROM orders o
    WHERE o.status = 'paid'
      AND NOT EXISTS (
          SELECT 1
          FROM webhook_events e
          WHERE e.stripe_payment_intent_id = o.stripe_payment_intent_id
            AND e.event_type = 'payment_intent.succeeded'
      )

    UNION ALL

    -- 3. Successful webhook, but order is not paid.
    SELECT
        'SUCCESS_EVENT_ORDER_NOT_PAID',
        o.id::text,
        e.id
    FROM webhook_events e
    JOIN orders o
      ON o.stripe_payment_intent_id = e.stripe_payment_intent_id
    WHERE e.event_type = 'payment_intent.succeeded'
      AND o.status <> 'paid'

    UNION ALL

    -- 4. Failed payment event, but order remains pending.
    SELECT
        'FAILED_EVENT_ORDER_PENDING',
        o.id::text,
        e.id
    FROM webhook_events e
    JOIN orders o
      ON o.stripe_payment_intent_id = e.stripe_payment_intent_id
    WHERE e.event_type = 'payment_intent.payment_failed'
      AND o.status = 'pending'

    UNION ALL

    -- 5. Processed webhook without a matching order.
    SELECT
        'ORPHAN_WEBHOOK_EVENT',
        NULL::text,
        e.id
    FROM webhook_events e
    WHERE NOT EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.stripe_payment_intent_id = e.stripe_payment_intent_id
    )

    UNION ALL

    -- 6. Unexpected webhook event type in the processed-event log.
    SELECT
        'UNEXPECTED_EVENT_TYPE',
        NULL::text,
        e.id
    FROM webhook_events e
    WHERE e.event_type NOT IN (
        'payment_intent.succeeded',
        'payment_intent.payment_failed'
    )
)

SELECT issue, order_id, event_id
FROM integrity_issues
ORDER BY issue, order_id, event_id;
