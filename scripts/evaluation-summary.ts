
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const scoreFields = [
  'symptom_score',
  'category_score',
  'root_cause_score',
  'abstention_score',
  'recommendation_score'
] as const;

type ScoreField = typeof scoreFields[number];

interface Evaluation {
  scenario_id: string;
  investigator: 'rule_based' | 'llm';
  review_status: string;

  symptom_score: number | null;
  category_score: number | null;
  root_cause_score: number | null;
  abstention_score: number | null;
  recommendation_score: number | null;
  unsupported_claim_count: number | null;
}

interface Scorecard {
  evaluations: Evaluation[];
}

async function main(): Promise<void> {
  // 1. Load completed manual evaluations.
  const filePath = resolve(
    'evaluation/scorecards/initial-review.json'
  );

  const scorecard = JSON.parse(
    await readFile(filePath, 'utf8')
  ) as Scorecard;

  const evaluations = scorecard.evaluations;

  // 2. Check that every evaluation is complete.
  if (evaluations.length !== 10) {
    throw new Error('Expected exactly 10 evaluations');
  }

  const seen = new Set<string>();

  for (const entry of evaluations) {
    if (entry.review_status !== 'reviewed') {
      throw new Error(`Review is incomplete: ${entry.scenario_id}`);
    }

    const key = `${entry.scenario_id}:${entry.investigator}`;

    if (seen.has(key)) {
      throw new Error(`Duplicate evaluation: ${key}`);
    }

    seen.add(key);

    for (const field of scoreFields) {
      const value = entry[field];

      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 2
      ) {
        throw new Error(`Invalid score: ${key}, ${field}`);
      }
    }

    const claims = entry.unsupported_claim_count;

    if (
      typeof claims !== 'number' ||
      !Number.isInteger(claims) ||
      claims < 0
    ) {
      throw new Error(`Invalid unsupported claim count: ${key}`);
    }
  }

  // 3. Calculate metrics separately for each investigator.
  const investigators = ['rule_based', 'llm'] as const;

  const results = investigators.map(investigator => {
    const reviews = evaluations.filter(
      entry => entry.investigator === investigator
    );

    if (reviews.length !== 5) {
      throw new Error(`Expected 5 reviews for ${investigator}`);
    }

    const totals = {} as Record<ScoreField, number>;

    for (const field of scoreFields) {
      totals[field] = reviews.reduce(
        (sum, entry) => sum + (entry[field] as number),
        0
      );
    }

    const unsupportedClaims = reviews.reduce(
      (sum, entry) => sum + (entry.unsupported_claim_count as number),
      0
    );

    return {
      investigator,
      scenarios_reviewed: reviews.length,
      ...totals,
      unsupported_claims: unsupportedClaims
    };
  });

  // 4. Display the comparison.
  console.table(results);

  console.log('Maximum per scored criterion: 10');
  console.log('Unsupported claims: lower is better.');
  console.log('These are preliminary manual review scores.');
  console.log('They are not independent accuracy estimates.');

  // 5. Save a machine-readable summary.
  const outputDir = resolve('evaluation/results');

  await mkdir(outputDir, { recursive: true });

  const outputPath = resolve(
    outputDir,
    'evaluation-summary.json'
  );

  await writeFile(
    outputPath,
    JSON.stringify({
      evaluation_type: 'preliminary_manual_review',
      scenarios: 5,
      reports_reviewed: evaluations.length,
      scores: results,
      limitations: [
        'The five scenarios were used during development.',
        'Scores were assigned by one reviewer.',
        'The rubric is preliminary.',
        'Scores do not establish independent diagnostic accuracy.'
      ]
    }, null, 2) + '\n',
    'utf8'
  );

  console.log(`Summary saved: ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
