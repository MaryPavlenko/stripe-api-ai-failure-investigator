
import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures/evidence-test.js';
import { getFailureMessages } from '../src/diagnostics/playwright-failure.js';

test('saves sanitised incident evidence', async ({
  evidenceCollector
}, testInfo) => {
  // Simulate collected diagnostic data.
  evidenceCollector.evidence.stripe.paymentStatus = 'failed';
  evidenceCollector.evidence.stripe.responseHttpStatus = 400;

  evidenceCollector.evidence.application.logs = [
    'Stripe key: sk_test_FAKE123456',
    'Payment failed'
  ];

  // Explicit saving for a controlled incident.
  const saved = await evidenceCollector.save();

  expect(saved).toBe(true);

  // Verify Playwright attachment exists.
  expect(
    testInfo.attachments.some(
      attachment => attachment.name === 'incident-evidence.json'
    )
  ).toBe(true);

  // Verify the actual file on disk.
  const evidencePath = testInfo.outputPath(
    'incident-evidence.json'
  );

  const output = await readFile(evidencePath, 'utf8');

  expect(output).toContain('[REDACTED_STRIPE_KEY]');
  expect(output).toContain('Payment failed');
  expect(output).not.toContain('sk_test_FAKE123456');
});

test('extracts the error from an unexpected test failure', () => {
  const messages = getFailureMessages({
    status: 'failed',
    expectedStatus: 'passed',
    errors: [
      {
        message: 'Error: expected 2, received 1\nat example.ts:10'
      }
    ]
  });

  expect(messages).toEqual([
    'Unexpected Playwright status: failed',
    'Error: expected 2, received 1'
  ]);
});

test('ignores expected test results', () => {
  const messages = getFailureMessages({
    status: 'passed',
    expectedStatus: 'passed',
    errors: []
  });

  expect(messages).toBeNull();
});
