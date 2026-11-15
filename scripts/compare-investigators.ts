
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { diagnoseWithRules } from '../src/diagnostics/rule-based-baseline.js';
import type { IncidentReport } from '../src/diagnostics/incident-report.js';

const scenarioIds = ['F001', 'F002', 'F003', 'F004', 'F005'];

interface SavedLlmResult {
  scenario_id: string;
  investigator: string;
  report: IncidentReport;
}

async function main(): Promise<void> {
  const results = [];

  for (const id of scenarioIds) {
    // Both investigators use the same evidence.
    const evidencePath = join(
      'evaluation',
      'evidence',
      `${id}.json`
    );

    const evidence: unknown = JSON.parse(
      await readFile(evidencePath, 'utf8')
    );

    // Generate the baseline locally. No API calls.
    const baseline = diagnoseWithRules(evidence);

    // Load the previously generated LLM report.
    const llmPath = join(
      'evaluation',
      'results',
      'llm',
      `llm-${id}.json`
    );

    const llmResult = JSON.parse(
      await readFile(llmPath, 'utf8')
    ) as SavedLlmResult;

    if (
      llmResult.scenario_id !== id ||
      llmResult.investigator !== 'llm'
    ) {
      throw new Error(`Invalid LLM report metadata: ${id}`);
    }

    const llm = llmResult.report;

    results.push({
      scenario: id,
      baselineDecision: baseline.decision,
      llmDecision: llm.decision,
      decisionMatch: baseline.decision === llm.decision,
      baselineCategory: baseline.failureCategory,
      llmCategory: llm.failureCategory,
      categoryMatch: baseline.failureCategory === llm.failureCategory
    });
  }

  console.table(results);

  const decisionMatches = results.filter(
    result => result.decisionMatch
  ).length;

  const categoryMatches = results.filter(
    result => result.categoryMatch
  ).length;

  console.log(`Decision agreement: ${decisionMatches}/${results.length}`);
  console.log(`Exact category agreement: ${categoryMatches}/${results.length}`);
  console.log('Note: Agreement is not diagnostic accuracy.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
