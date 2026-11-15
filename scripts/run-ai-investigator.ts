
import 'dotenv/config';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { diagnoseWithLlm } from '../src/diagnostics/llm-investigator.js';

const scenarioIds = ['F001', 'F002', 'F003', 'F004', 'F005'];

async function main(): Promise<void> {
  // 1. Read scenario ID from the command line.
  const scenarioId = process.argv[2];

  if (!scenarioId || !scenarioIds.includes(scenarioId)) {
    throw new Error(
      'Provide a scenario ID: F001, F002, F003, F004 or F005'
    );
  }

  // 2. Read evidence only. Never load ground truth.
  const evidencePath = resolve(
    'evaluation',
    'evidence',
    `${scenarioId}.json`
  );

  const evidence: unknown = JSON.parse(
    await readFile(evidencePath, 'utf8')
  );

  console.log(`Investigating ${scenarioId} with OpenAI...`);

  // 3. Validate evidence and request an AI diagnosis.
  const report = await diagnoseWithLlm(evidence);

  // 4. Prepare a standard evaluation result.
  const result = {
    scenario_id: scenarioId,
    investigator: 'llm',
    model: 'gpt-6-luna',
    report
  };

  // 5. Save the report outside Git-tracked files.
  const outputDir = resolve('evaluation/results/llm');

  await mkdir(outputDir, { recursive: true });

  const outputPath = resolve(
    outputDir,
    `llm-${scenarioId}.json`
  );

  await writeFile(
    outputPath,
    JSON.stringify(result, null, 2) + '\n',
    'utf8'
  );

  console.log(`AI Incident Report saved: ${outputPath}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(
    'AI investigation failed:',
    error instanceof Error ? error.message : 'Unknown error'
  );

  process.exitCode = 1;
});
