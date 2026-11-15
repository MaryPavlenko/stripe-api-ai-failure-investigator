# Stripe API — Test Execution Results

## 1. Overview

This document summarises the results of exploratory and automated API testing performed against the Stripe Sandbox environment on 7–8 November 2026.

**Objective:** Validate core PaymentIntent API operations, response consistency, input validation and event retrieval before implementing the automated test suite in Playwright and TypeScript.

The initial testing phase uses Postman and JavaScript assertions to explore Stripe API behaviour and establish validated test scenarios for future automation.

## 2. Test Environment

| Component | Configuration |
|---|---|
| API | Stripe REST API (`/v1` endpoints) |
| Environment | Stripe Sandbox (test mode) |
| API client | Postman |
| Test scripting | JavaScript |
| Test execution | Postman and Postman Collection Runner |
| Authentication | Stripe test API key, stored securely |
| Request encoding | `application/x-www-form-urlencoded` |
| Response format | JSON |
| Test currency | GBP |
| Test payment amount | 1000 minor units (£10.00) |

## 3. Test Results

| Test Case | Expected Result | Actual Result | Status |
|---|---|---|---|
| List PaymentIntents | HTTP 200; valid JSON list | HTTP 200; list retrieved successfully | PASS |
| Create PaymentIntent | HTTP 200; PaymentIntent created with expected amount, currency and initial status | HTTP 200; amount 1000 GBP; status `requires_payment_method`; 6 assertions passed | PASS |
| Retrieve PaymentIntent | HTTP 200; retrieved object matches the created PaymentIntent | HTTP 200; ID, amount, currency and status matched; 6 assertions passed | PASS |
| Automated POST → GET workflow | Both requests execute sequentially; response data remains consistent | 12 assertions passed; 0 failures | PASS |
| Verify POST request encoding | Payment parameters configured in the request body using form-urlencoded encoding | URL, Body and Content-Type configuration verified in Postman; separate execution verification not recorded | CONFIG VERIFIED |
| Reject negative payment amount | HTTP 400; structured validation error identifying `amount` | HTTP 400; `invalid_request_error`; `parameter_invalid_integer`; 6 assertions passed | PASS |
| List Stripe Events | HTTP 200; valid JSON list containing Stripe events | HTTP 200; 10 events returned; 4 assertions passed | PASS |

## 4. Automation Results

### 4.1 PaymentIntent Creation and Retrieval

The Postman Collection Runner successfully executed the PaymentIntent creation and retrieval workflow.

| Metric | Result |
|---|---|
| API requests | 2 |
| Assertions | 12 |
| Passed | 12 |
| Failed | 0 |
| Iterations | 1 |
| Execution time | 1.185 seconds |

**Workflow:**

1. Create a PaymentIntent using `POST /v1/payment_intents`.
2. Store the PaymentIntent ID and expected response values in Postman environment variables.
3. Retrieve the created PaymentIntent using `GET /v1/payment_intents/{id}`.
4. Validate HTTP status, PaymentIntent ID, amount, currency, payment status and test mode.

**Result:** All 12 assertions passed, confirming response consistency between PaymentIntent creation and retrieval.

### 4.2 Negative API Testing — Invalid Payment Amount

**Test scenario:** Verify that Stripe rejects a PaymentIntent creation request with a negative amount.

**Endpoint:** `POST /v1/payment_intents`

**Test data:**

- `amount`: `-100`
- `currency`: `gbp`
- `automatic_payment_methods[enabled]`: `true`

**Expected behaviour:** Stripe rejects the request with an HTTP client error and a structured validation error.

**Actual response:**

| Field | Actual Value |
|---|---|
| HTTP Status | `400 Bad Request` |
| `error.type` | `invalid_request_error` |
| `error.code` | `parameter_invalid_integer` |
| `error.param` | `amount` |
| `error.message` | `This value must be greater than or equal to 1.` |

**Automated assertions:**

1. HTTP status is 400.
2. Response contains an error object.
3. Error type is `invalid_request_error`.
4. Error code is `parameter_invalid_integer`.
5. Invalid parameter is `amount`.
6. Error message is a non-empty string.

**Result:** 6 assertions passed; 0 failed.

**Finding:** Stripe correctly rejected the negative payment amount and identified the invalid request parameter.

This test demonstrates that an HTTP 400 response can represent a successful negative test when the observed API behaviour matches the expected validation rules.

### 4.3 Stripe Events Retrieval

**Endpoint:** `GET /v1/events?limit=10`

**Objective:** Verify event retrieval and examine events generated in the Stripe Sandbox environment.

**Automated assertions:**

1. HTTP status is 200.
2. Response object is `list`.
3. The `data` field contains an array.
4. Every returned event has an ID beginning with `evt_` and a string-valued `type`.

**Result:** 4 assertions passed; 0 failed.

**Observed response:**

| Property | Actual Result |
|---|---|
| HTTP Status | `200 OK` |
| Events returned | 10 |
| `has_more` | `true` |
| `payment_intent.created` | 6 events |
| `account.updated` | 4 events |

The response contained six PaymentIntent creation events and four account update events.

The value `has_more=true` indicates that additional events are available beyond the first page of results.

The distribution above represents only the ten events retrieved in this request, not the complete event history.

No `payment_intent.succeeded` event was observed among these ten events. PaymentIntent creation was tested, but successful payment confirmation was not part of this testing phase.

## 5. Findings and Limitations

### 5.1 PaymentIntent Lifecycle

- Creating a PaymentIntent does not automatically complete a payment.
- The observed initial PaymentIntent status was `requires_payment_method`.
- A successful API response (`HTTP 200`) does not necessarily indicate a successful payment.
- Payment confirmation, cancellation, failures and refunds have not yet been tested.

### 5.2 Input Validation

- Stripe rejected a negative payment amount (`amount=-100`) with HTTP 400.
- The response contained a structured error object.
- The `error.param` field identified `amount` as the invalid parameter.
- Assertions validated both the HTTP status and the underlying error details.
- Additional boundary-value and invalid-input scenarios remain outside the current test coverage.

### 5.3 Stripe Events

- PaymentIntent creation generated observable `payment_intent.created` events in the retrieved event history.
- Stripe account updates were represented by separate `account.updated` events.
- Event types must be read from the top-level `type` field of each Event object, rather than from similarly named fields inside nested objects.
- The Events API uses pagination; `has_more=true` indicates that additional results are available.
- Successful event retrieval does not establish successful webhook delivery.

### 5.4 PaymentIntent, Event and Webhook Delivery

These represent distinct concepts:

- **PaymentIntent:** A Stripe resource representing a payment attempt and its lifecycle.
- **Event:** A Stripe record describing an occurrence, such as `payment_intent.created`.
- **Webhook Delivery:** An HTTP delivery attempt used to notify a configured application endpoint about an event.

An Event may exist even when webhook delivery fails. Repeated delivery attempts also need to be handled safely by the receiving application.

Webhook delivery and processing were not tested during this phase.

### 5.5 Test Coverage Limitations

- PaymentIntent creation and retrieval were validated using Postman.
- Automated execution was demonstrated through the Postman Collection Runner.
- Negative input validation and Stripe Events retrieval were tested independently in Postman.
- The final positive POST request configuration was inspected, but a separate execution after that inspection was not recorded.
- The complete payment lifecycle has not yet been automated.
- Webhook signature verification, retries and duplicate delivery handling remain untested.
- PostgreSQL data consistency checks have not yet been executed.
- Playwright, TypeScript and GitHub Actions execution remain future implementation stages.
- AI-assisted failure investigation has not yet been implemented or evaluated.

## 6. Next Steps

### API Test Automation

- Implement the validated API test scenarios using Playwright and TypeScript.
- Create a reusable Stripe API client.
- Add test fixtures and reusable assertion helpers.
- Expand negative and boundary-value testing.
- Automate PaymentIntent lifecycle scenarios.

### Payment Integration and Reliability

- Implement a local payment integration application.
- Configure PostgreSQL and Docker.
- Integrate Stripe webhooks and validate event signatures.
- Test webhook retries, duplicate events and out-of-order delivery.
- Verify consistency between Stripe payment states and local database records.

### CI/CD and Failure Investigation

- Configure GitHub Actions for automated API testing.
- Separate deterministic CI tests from Stripe Sandbox integration tests.
- Generate automated test reports and diagnostic artifacts.
- Collect relevant API responses, webhook data, application logs and SQL evidence when tests fail.
- Implement an AI-assisted failure investigator.
- Evaluate the quality and accuracy of AI-generated root-cause analysis against known failure scenarios.

## 7. Summary

The Stripe API exploration phase successfully validated PaymentIntent creation, retrieval, negative input validation and event listing.

**Confirmed test execution results:**

- PaymentIntent POST → GET workflow: 12/12 assertions passed.
- Negative payment amount validation: 6/6 assertions passed.
- Stripe Events retrieval: 4/4 assertions passed.
- No failed assertions were observed in these recorded executions.

These results establish a foundation for implementing a reusable automated API testing framework using Playwright and TypeScript.

The next development stage will extend the project beyond API exploration towards payment lifecycle automation, webhook reliability, database consistency validation and evidence-based failure investigation.

## 8. Stage 4 — Payment Integration

**Execution date:** 14 November 2026
**Environment:** Local development and Stripe Sandbox
**Technology:** Node.js, Express, TypeScript, PostgreSQL 17, Docker Compose, Stripe SDK, Stripe CLI, DBeaver

### 8.1 Objective

Validate the initial integration between the local Express application, PostgreSQL, Stripe PaymentIntents and signed webhook events.

**Expected flow:**

`Order → PaymentIntent → Payment succeeded → Webhook → PostgreSQL → paid`

### 8.2 Test Execution Results

| Test Scenario | Actual Result | Status |
|---|---|---|
| PostgreSQL connectivity | SQL connection established successfully | PASS |
| Database schema verification | `orders` and `webhook_events` tables and constraints verified | PASS |
| Express health check | `GET /health` returned HTTP 200 | PASS |
| Invalid order amount | `POST /orders` with `amount=-100` returned HTTP 400 | PASS |
| Order creation | `POST /orders` returned HTTP 201 | PASS |
| Stripe PaymentIntent creation | Test PaymentIntent created and linked to the local order | PASS |
| Database persistence | Order found in PostgreSQL with status `pending` | PASS |
| Invalid webhook signature | HTTP 400, `Invalid webhook signature` | PASS |
| Valid webhook signature | Locally signed unsupported event returned HTTP 200, `ignored` | PASS |
| Test payment confirmation | PaymentIntent status changed to `succeeded` in Stripe Sandbox | PASS |
| Webhook delivery | Stripe CLI forwarded `payment_intent.succeeded`; Express returned HTTP 200 | PASS |
| Payment status synchronisation | PostgreSQL order status changed from `pending` to `paid` | PASS |
| Webhook event persistence | Matching event recorded in `webhook_events` | PASS |

### 8.3 Integration Investigation — Payment Succeeded but Order Remained Pending

**Initial observation**

The first test payment was successfully confirmed in Stripe Sandbox, but the corresponding local order remained `pending`.

A SQL query also returned no matching record in `webhook_events`.

**Investigation**

The Stripe CLI listener was found to be inactive during the subsequent investigation. This was a likely explanation for the missing webhook delivery, although its exact state at the time of the first payment was not independently established.

A separate SQL formatting issue in the PostgreSQL event-handling query was also identified and corrected before the successful end-to-end test.

**Resolution and verification**

Express and Stripe CLI were started in separate terminals and kept running simultaneously.

A new local order and Stripe PaymentIntent were created. The payment was confirmed using a Stripe Sandbox test payment method.

Stripe CLI recorded a `payment_intent.succeeded` event and an HTTP 200 response from the Express webhook endpoint.

A subsequent SQL query confirmed:

- The order status was `paid`.
- The matching `payment_intent.succeeded` event was stored in `webhook_events`.
- The event was associated with the correct PaymentIntent.

### 8.4 Final Result

**PASS — Initial end-to-end payment integration verified.**

The application successfully:

1. Created a local order in PostgreSQL.
2. Created and linked a Stripe Sandbox PaymentIntent.
3. Confirmed a test payment.
4. Received a signed `payment_intent.succeeded` webhook through Stripe CLI.
5. Processed the webhook and persisted its event record.
6. Updated the local order status from `pending` to `paid`.

### 8.5 Scope and Limitations

- All payments used Stripe Sandbox; no real money was transferred.
- Correct and incorrect webhook signatures were tested.
- The successful payment flow was verified using HTTP responses, Stripe CLI logs and SQL queries.
- Duplicate webhook deliveries, concurrent processing, retry behaviour, event ordering and further payment failure scenarios have not yet been comprehensively tested.
- These reliability scenarios will be addressed in subsequent project stages.

## Stage 5 — Payment API Test Automation

**Execution date:** 15 November 2026
**Framework:** Playwright + TypeScript
**Environment:** Local Express API and Stripe Sandbox

### Objective

Automate payment lifecycle scenarios and validate API responses, payment state transitions, refunds, idempotency and boundary-value behaviour.

### Test Execution Results

| Test Scenario | Result |
|---|---|
| Successful payment confirmation | PASS |
| Declined payment | PASS |
| Invalid amounts and currencies | PASS |
| Minimum amount and boundary values | PASS |
| PaymentIntent cancellation | PASS |
| Full refund | PASS |
| Partial refund | PASS |
| Idempotency key reuse and parameter conflicts | PASS |
| PaymentIntent status transitions | PASS |

### Regression Execution

| Test Suite | Tests | Passed | Failed |
|---|---:|---:|---:|
| Local API tests | 16 | 16 | 0 |
| Stripe Sandbox integration tests | 13 | 13 | 0 |
| **Total** | **29** | **29** | **0** |

**TypeScript validation:** PASS (`tsc --noEmit`)

### Key Findings

- Stripe Sandbox rejected GBP amounts below £0.30.
- The local Express API accepted order amounts between £1 and £1,000 inclusive.
- Declined card payments returned structured errors without completing the payment.
- Full and partial refunds were successfully created and independently verified.
- Repeated PaymentIntent creation requests using the same idempotency key returned the same PaymentIntent.
- Reusing an idempotency key with different parameters was rejected.
- A declined PaymentIntent could subsequently succeed with a valid test payment method.
- An already succeeded PaymentIntent could not be cancelled.

### Test Automation Improvements

During test development, two incorrect assumptions about Stripe response fields were identified and corrected:

- The `amount_too_small` validation error did not include `error.param`.
- The Refund response did not include the expected `livemode` field.

Assertions were updated to validate the actual Stripe API response structure.

### Final Result

**PASS — All 29 automated tests passed.**

The suite provides automated coverage of key payment API operations, including successful and declined payments, validation, boundary values, cancellation, refunds, idempotency and status transitions.

Local tests use an in-memory order store and a fake payment gateway. Stripe Sandbox tests exercise the real Stripe API using test credentials. Broader webhook reliability and database consistency testing are planned for subsequent stages.

## Stage 6 — Webhook Reliability Testing

- **Execution date:** 15 November 2026
- **Framework:** Playwright + TypeScript
- **Environment:** Local Express API, Stripe Sandbox and PostgreSQL test database (`payment_lab_test`)

### Objective

Verify reliable and secure Stripe webhook processing, including signature validation, duplicate delivery, out-of-order events, error handling, transaction rollback and successful processing after recovery.

### Test Coverage

| Test Scenario | Result |
|---|---|
| Successful payment webhook (`payment_intent.succeeded`) | PASS |
| Failed payment webhook (`payment_intent.payment_failed`) | PASS |
| Invalid webhook signature rejection | PASS |
| Duplicate webhook delivery | PASS |
| Out-of-order webhook events | PASS |
| HTTP 500 error handling | PASS |
| Retry after recovery | PASS |
| Prevention of duplicate processing under concurrent delivery | PASS |

### PostgreSQL Integration Tests

Five automated integration tests were executed against an isolated PostgreSQL database:

1. Stores a failed payment webhook and updates the order status.
2. Processes repeated delivery of the same webhook only once.
3. Preserves a paid order when an older failure event arrives later.
4. Returns HTTP 500 for a processing failure, rolls back the transaction and