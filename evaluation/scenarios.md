
# AI Failure Investigator — Evaluation Scenarios

## Objective

Create 15–20 reproducible payment integration incidents with known root causes.

The scenarios will be used to compare AI-based diagnosis against a rule-based baseline.

The experiment will measure root-cause accuracy, unsupported claims, abstention quality and the usefulness of diagnostic recommendations.

## Scenario Template

Each scenario must document:

- **Scenario ID:** Unique identifier (F001, F002, etc.).
- **Failure Type:** Category of the incident.
- **Injection:** How the failure is reproduced.
- **Observed Evidence:** Diagnostic facts available to the investigator.
- **Ground Truth:** Verified root cause of the incident.
- **Expected Diagnosis:** What a correct diagnosis should identify.
- **Source Test:** Automated test used to reproduce the scenario.
- **Status:** Planned, In Progress or Verified.

---

## Evaluation Rules

- Each incident must have a reproducible failure condition.
- Ground truth must be verified before evaluation.
- Ground truth must never be included in the LLM input.
- Evidence must be sanitised before storage and analysis.
- Scenarios with insufficient evidence must be included.
- AI and the rule-based baseline must receive comparable inputs.
- Diagnostic conclusions must be supported by available evidence.
- The investigator must distinguish confirmed facts from hypotheses.
- Fault-injection tests must not modify production behaviour.
- Evaluation results must be based on actual experiment outcomes.

---

## Scenario Catalogue

### F001 — Database Timeout During Webhook Processing

**Scenario ID:** F001

**Failure Type:** Transient storage failure

**Injection:**

Set `store.failNextEvent = true` in `MemoryOrderStore` before processing a simulated `payment_intent.succeeded` webhook.

**Observed Evidence:**

- Webhook event type: `payment_intent.succeeded`
- First delivery HTTP status: 500
- Order status after first delivery: `pending`
- Retry uses the same webhook event ID
- Retry HTTP status: 200
- Retry processing result: `processed`
- Order status after retry: `paid`
- Application error: not included in evaluation evidence

**Ground Truth:**

`simulated_storage_timeout`

The `MemoryOrderStore` deliberately throws `Simulated database timeout` during the first attempt to process the webhook.

This is a simulated storage failure, not a real PostgreSQL timeout.

**Expected Diagnosis:**

- Identify a transient failure during webhook processing.
- Explain that the order was not updated on the first attempt.
- Recognise that retrying the same event succeeds.
- Recommend checking application and storage error logs.
- Avoid claiming a confirmed database timeout unless the evidence supports that conclusion.

**Source Test:**

`tests/api.spec.ts`

Test: `returns 500 for a database timeout, then safely processes the retry`

**Evidence File:** `evaluation/evidence/F001.json`

**Ground Truth File:** `evaluation/ground-truth/F001.json`

**Status:** Verified — automated test passed, evidence exported, ground truth documented.

---

### F002 — Duplicate Webhook Processing

**Scenario ID:** F002

**Failure Type:** Idempotency failure

**Injection:**

Use `FaultyDedupStore`, which deliberately replaces the original webhook event ID with a unique ID for each delivery.

This simulates an application defect in webhook event identity handling.

**Observed Evidence:**

- Webhook event type: `payment_intent.succeeded`
- First delivery HTTP status: 200
- First processing result: `processed`
- Second delivery uses the same original event ID
- Second delivery HTTP status: 200
- Second processing result: `processed`
- Observed processing count: 2

**Ground Truth:**

`webhook_event_id_rewritten_per_delivery`

The `FaultyDedupStore` modifies the original event ID before passing it to `MemoryOrderStore`.

Consequently, the deduplication mechanism treats repeated deliveries as separate events.

**Expected Diagnosis:**

- Identify duplicate webhook processing.
- Recognise that both deliveries were processed.
- Suspect incorrect event ID handling or deduplication.
- Recommend checking event identity and idempotency storage.
- Avoid claiming that the customer was charged twice.
- Avoid asserting the exact internal defect without supporting evidence.

**Source Test:**

`tests/fault-injection.spec.ts`

Test: `F002 captures duplicate webhook processing`

**Evidence File:** `evaluation/evidence/F002.json`

**Ground Truth File:** `evaluation/ground-truth/F002.json`

**Status:** Verified — fault-injection test passed, evidence exported, ground truth documented and validated.

---


### F003 — Payment Amount Mismatch

**Scenario ID:** F003

**Failure Type:** Payment data inconsistency

**Injection:**

Send a signed `payment_intent.succeeded` webhook with an amount of 5000 pence for an order created with an amount of 1000 pence.

**Observed Evidence:**

- Order amount: 1000 pence
- Webhook amount: 5000 pence
- Order currency: `gbp`
- Webhook currency: `gbp`
- Webhook HTTP status: 500
- Order status after rejection: `pending`
- Application error: not included in evaluation evidence

**Ground Truth:**

`webhook_payment_amount_mismatch`

The webhook contains a payment amount that does not match the associated order.

`MemoryOrderStore` rejects the event because no order matches the supplied PaymentIntent ID, amount and currency combination.

**Expected Diagnosis:**

- Identify the discrepancy between order and webhook amounts.
- Explain why the payment event could not be applied.
- Recognise that the order remains pending.
- Recommend checking payment amount validation and the consistency of webhook data.
- Avoid claiming a fraudulent payment or incorrect customer charge without evidence.

**Source Test:**

`tests/api.spec.ts`

Test: `does not accept a webhook with the wrong payment amount`

**Evidence File:** `evaluation/evidence/F003.json`

**Ground Truth File:** `evaluation/ground-truth/F003.json`

**Status:** Verified — automated evidence generated. Ground truth validation pending.

---


### F004 — Delayed Payment Failure Webhook

**Scenario ID:** F004

**Failure Type:** Incorrect payment state transition

**Injection:**

Use `FaultyLateFailureStore`, which deliberately allows a `payment_intent.payment_failed` webhook to overwrite an order already marked as `paid`.

**Observed Evidence:**

- First event type: `payment_intent.succeeded`
- First event HTTP status: 200
- Order status after success: `paid`
- Second event type: `payment_intent.payment_failed`
- Second event has a different event ID
- Second event HTTP status: 200
- Order status after delayed failure: `payment_failed`
- Application error: not included in evaluation evidence

**Ground Truth:**

`paid_order_overwritten_by_late_failure_event`

The test-only `FaultyLateFailureStore` removes the state transition guard that normally prevents late failure events from overwriting paid orders.

**Expected Diagnosis:**

- Identify an incorrect payment state transition.
- Recognise that a previously paid order was changed to `payment_failed`.
- Suspect missing state transition protection or incorrect webhook ordering logic.
- Recommend enforcing valid payment state transitions.
- Recommend verifying the authoritative payment status before changing an already paid order.
- Avoid asserting the exact implementation defect without supporting evidence.

**Source Test:**

`tests/fault-injection.spec.ts`

Test: `F004 captures incorrect payment status after delayed failure webhook`

**Evidence File:** `evaluation/evidence/F004.json`

**Ground Truth File:** `evaluation/ground-truth/F004.json`

**Status:** Verified — fault injection test passed, evidence exported, ground truth documented.

---


### F005 — Stripe and Database Status Mismatch

**Scenario ID:** F005

**Failure Type:** Payment state inconsistency / Insufficient evidence

**Test Setup:**

Create an order in PostgreSQL, link it to a real Stripe Sandbox PaymentIntent, and confirm the payment.

Do not invoke webhook processing in the application.

**Observed Evidence:**

- Stripe payment status: `succeeded`
- Stripe API HTTP status: 200
- PostgreSQL order status: `pending`
- PaymentIntent ID matches
- Amount matches
- Currency matches
- Recorded webhook events: 0
- Webhook delivery HTTP status: unknown
- Application logs: unavailable

**Ground Truth:**

`webhook_processing_not_invoked_in_test`

The test deliberately does not process a webhook, so the order remains pending.

However, this information is not included in the AI evaluation evidence.

**Expected Diagnosis:**

`insufficient_evidence`

The AI should:

- Detect the inconsistency between Stripe and PostgreSQL.
- Recognise that payment identity, amount and currency match.
- Explain that the available evidence does not establish the exact cause.
- Recommend checking webhook delivery, application processing and database updates.
- Avoid claiming a specific webhook or database failure without evidence.

**Source Test:**

`tests/payment-consistency.spec.ts`

Test: `detects a succeeded Stripe payment with a pending database order`

**Evidence File:** `evaluation/evidence/F005.json`

**Ground Truth File:** `evaluation/ground-truth/F005.json`

**Status:** Verified — Stripe Sandbox and PostgreSQL test passed, evidence exported, ground truth documented.

---

## Evaluation Progress

- F001: Verified
- F002: Verified
- F003: Verified
- F004: Verified
- F005: Verified

**Target:** 15–20 reproducible diagnostic scenarios.

**AI evaluation:** Not started.

**Rule-based baseline:** Not implemented.
