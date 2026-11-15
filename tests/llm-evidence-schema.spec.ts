
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

import { SafeEvidenceSchema } from '../src/diagnostics/llm-investigator.js';

const scenarioIds = [
  'F001',
  'F002',
  'F003',
  'F004',
  'F005'
];

// Validate and sanitise all five evidence formats.
for (const id of scenarioIds) {
  test(`${id} accepts evidence and excludes unknown fields`, async () => {
    const filePath = join(
      process.cwd(),
      'evaluation',
      'evidence',
      `${id}.json`
    );

    const evidence = JSON.parse(
      await readFile(filePath, 'utf8')
    );

    // Inject test-only fields that must never reach the LLM.
    const input = {
      ...evidence,
      ground_truth: {
        root_cause: 'SECRET_TEST_MARKER'
      },
      debug: 'SECRET_TEST_MARKER',
      application: {
        logs: ['SECRET_TEST_MARKER']
      }
    };

    const safeEvidence = SafeEvidenceSchema.parse(input);

    // Check that the parsed evidence contains useful data.
    expect(Object.keys(safeEvidence).length).toBeGreaterThan(0);

    // Check that excluded fields are removed.
    expect('scenario_id' in safeEvidence).toBe(false);
    expect('ground_truth' in safeEvidence).toBe(false);
    expect('debug' in safeEvidence).toBe(false);
    expect('application' in safeEvidence).toBe(false);
    expect('application_error' in safeEvidence).toBe(false);

    // Check that the injected marker was not included.
    const safeJson = JSON.stringify(safeEvidence);

    expect(safeJson).not.toContain('SECRET_TEST_MARKER');
  });
}

test('rejects an unknown evidence structure', () => {
  const result = SafeEvidenceSchema.safeParse({
    unknown_field: 'some value'
  });

  expect(result.success).toBe(false);
});

test('rejects invalid payment amount types', () => {
  const result = SafeEvidenceSchema.safeParse({
    event_type: 'payment_intent.succeeded',

    order: {
      amount_pence: '1000',
      currency: 'gbp',
      status: 'pending'
    },

    webhook: {
      amount_pence: 5000,
      currency: 'gbp',
      http_status: 500
    }
  });

  expect(result.success).toBe(false);
});

test('rejects a secret inside an allowed evidence field', () => {
  const evidence = {
    event_type: 'payment_intent.succeeded',

    order: {
      amount_pence: 1000,
      currency: 'sk_test_FAKE_SECRET_FOR_TESTING',
      status: 'pending'
    },

    webhook: {
      amount_pence: 5000,
      currency: 'gbp',
      http_status: 500
    }
  };

  const result = SafeEvidenceSchema.safeParse(evidence);

  expect(result.success).toBe(false);
});
