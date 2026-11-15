
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const scenarioIds = [
  'F001',
  'F002',
  'F003',
  'F004',
  'F005'
];

const investigators = ['rule_based', 'llm'];

const evaluations = scenarioIds.flatMap(scenarioId =>
  investigators.map(investigator => ({
    scenario_id: scenarioId,
    investigator,

    review_status: 'pending',

    symptom_score: null,
    category_score: null,
    root_cause_score: null,
    abstention_score: null,
    unsupported_claim_count: null,
    recommendation_score: null,

    claim_details: [],
    reviewer_notes: ''
  }))
);

const scorecard = {
  version: '1.0',
  rubric: 'evaluation/rubric.md',
  evaluation_type: 'manual_review',
  evaluations
};

async function main(): Promise<void> {
  const directory = join('evaluation', 'scorecards');

  await mkdir(directory, { recursive: true });

  const outputPath = join(directory, 'initial-review.json');

  await writeFile(
    outputPath,
    JSON.stringify(scorecard, null, 2) + '\n',
    { encoding: 'utf8', flag: 'wx' }
  );

  console.log(`Scorecard created: ${outputPath}`);
  console.log(`Evaluation entries: ${evaluations.length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
