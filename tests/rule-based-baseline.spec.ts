
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

import { diagnoseWithRules } from '../src/diagnostics/rule-based-baseline.js';

const scenarios = [
  {
    id: 'F001',
    category: 'transient_processing_failure',
    decision: 'insufficient_evidence',
    rootCause: null
  },
  {
    id: 'F002',
    category: 'idempotency_failure',
    decision: 'insufficient_evidence',
    rootCause: null
  },
  {
    id: 'F003',
    category: 'payment_data_inconsistency',
    decision: 'root_cause_identified',
    rootCause: 'webhook_payment_amount_mismatch'
  },
  {
    id: 'F004',
    category: 'incorrect_payment_state_transition',
    decision: 'insufficient_evidence',
    rootCause: null
  },
  {
    id: 'F005',
    category: 'payment_state_inconsistency',
    decision: 'insufficient_evidence',
    rootCause: null
  }
];

for (const scenario of scenarios) {
  test(`${scenario.id} returns the expected baseline diagnosis`, async () => {
    const filePath = join(
      process.cwd(),
      'evaluation',
      'evidence',
      `${scenario.id}.json`
    );

    const evidence = JSON.parse(
      await readFile(filePath, 'utf8')
    );

    const report = diagnoseWithRules(evidence);

    expect(report.failureCategory).toBe(scenario.category);
    expect(report.decision).toBe(scenario.decision);
    expect(report.probableRootCause).toBe(scenario.rootCause);

    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.supportingEvidence.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);

    // A diagnosis must not depend on the scenario ID.
    const modifiedEvidence = {
      ...evidence,
      scenario_id: 'UNKNOWN'
    };

    expect(diagnoseWithRules(modifiedEvidence)).toEqual(report);
  });
}

test('unknown evidence does not produce an invented root cause', () => {
  const report = diagnoseWithRules({});

  expect(report.decision).toBe('insufficient_evidence');
  expect(report.probableRootCause).toBeNull();
  expect(report.confidence).toBe('low');
});


test('exports baseline incident reports for all scenarios', async ({}, testInfo) => {
  for (const scenario of scenarios) {
    // Read only evidence, never ground truth.
    const evidencePath = join(
      process.cwd(),
      'evaluation',
      'evidence',
      `${scenario.id}.json`
    );

    const evidence = JSON.parse(
      await readFile(evidencePath, 'utf8')
    );

    // Generate the rule-based diagnosis.
    const report = diagnoseWithRules(evidence);

    // Scenario ID is metadata, not a diagnostic input.
    const result = {
      scenario_id: scenario.id,
      investigator: 'rule_based',
      report
    };

    const fileName = `baseline-${scenario.id}.json`;
    const outputPath = testInfo.outputPath(fileName);

    await writeFile(
      outputPath,
      JSON.stringify(result, null, 2) + '\n',
      'utf8'
    );

    await testInfo.attach(fileName, {
      path: outputPath,
      contentType: 'application/json'
    });
  }
});

