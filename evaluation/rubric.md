
# AI Failure Investigator — Evaluation Rubric

## Objective

Evaluate whether an investigator produces accurate, evidence-supported
and actionable incident diagnoses.

Compare the Rule-Based Baseline and LLM Investigator using identical
diagnostic evidence.

Agreement between investigators is not diagnostic accuracy.

## Evaluation Principles

1. Evaluate both investigators using the same criteria.
2. Separate observable symptoms from underlying root causes.
3. Do not reward unsupported causal claims.
4. Do not penalise justified uncertainty.
5. Treat recommendations as proposed actions, not observed facts.
6. Never include ground truth in investigator input.
7. Evaluate reports independently before comparing them.

## 1. Symptom Identification

Does the report correctly describe what happened?

Score:
- 0: Incorrect or missing symptoms.
- 1: Partially correct identification.
- 2: Correct identification of the important observed symptoms.

## 2. Failure Category

Does the selected category describe the observed problem?

Score:
- 0: Incorrect or unsupported category.
- 1: Broad but defensible category.
- 2: Correct and sufficiently specific category.

Exact string agreement is not required for a defensible diagnosis.

## 3. Root-Cause Reasoning

Does the report distinguish observed discrepancies from causal mechanisms?

Score:
- 0: Unsupported or incorrect causal conclusion.
- 1: Plausible explanation with insufficient qualification,
     or incomplete reasoning.
- 2: Evidence-supported conclusion or justified refusal
     to identify an exact root cause.

An observed mismatch does not automatically prove why an
application returned an error.

## 4. Abstention Quality

Does the investigator appropriately recognise insufficient evidence?

Score:
- 0: Incorrectly claims certainty or fails to diagnose
     when evidence clearly supports a conclusion.
- 1: Partially appropriate uncertainty.
- 2: Correctly identifies when an exact cause can or cannot
     be established from the supplied evidence.

## 5. Unsupported Claims

Count factual claims about the incident that are not supported
by the available evidence.

Do not count explicitly labelled hypotheses or proposed checks
as unsupported factual claims.

Record:
- unsupported_claim_count: integer
- claim_details: list of identified claims

Lower is better.

## 6. Recommendation Usefulness

Are the investigation steps practical, relevant and safe?

Score:
- 0: Incorrect, unsafe or irrelevant recommendations.
- 1: Relevant but generic recommendations.
- 2: Specific, actionable recommendations supported
     by the incident context.

## Evaluation Output

For each scenario and investigator, record:

- scenario_id
- investigator
- symptom_score: 0–2
- category_score: 0–2
- root_cause_score: 0–2
- abstention_score: 0–2
- unsupported_claim_count
- recommendation_score: 0–2
- reviewer_notes

## Reporting Rules

- Report each metric separately.
- Do not treat the sum of scores as a validated accuracy metric.
- Report exact category agreement separately from category quality.
- Distinguish root-cause correctness from root-cause observability.
- Review ambiguous cases manually.
- Document limitations and disagreements.

## Current Study Limitations

The initial five scenarios were used during development
of the baseline and LLM workflow.

They are development examples, not an independent test set.

An expanded evaluation should include previously unseen incidents,
ambiguous evidence and repeated LLM runs.
