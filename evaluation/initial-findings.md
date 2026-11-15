
# AI Failure Investigator — Initial Evaluation Findings

## Experiment Overview

This initial experiment compares a Rule-Based Baseline with an LLM-based investigator for diagnosing payment integration failures.

Both investigators received the same diagnostic evidence.

Dataset: F001–F005
Investigators: Rule-Based Baseline, LLM
Evaluation method: Preliminary manual review
Reports evaluated: 10

## Preliminary Results

| Metric | Rule-Based | LLM |
|---|---:|---:|
| Symptom Identification | 10/10 | 10/10 |
| Failure Category | 9/10 | 9/10 |
| Root-Cause Reasoning | 9/10 | 10/10 |
| Abstention Quality | 9/10 | 10/10 |
| Recommendation Usefulness | 10/10 | 10/10 |
| Unsupported Claims | 0 | 0 |

Decision agreement: 4/5
Exact category agreement: 4/5

Agreement measures similarity between investigators, not diagnostic accuracy.

## Key Findings

### F003 — Payment Amount Mismatch

Both investigators identified the mismatch between order and webhook amounts.

The Rule-Based Baseline identified the amount mismatch as the root cause.

The LLM recognised the mismatch but did not claim that it conclusively explained the HTTP 500 response.

This highlights the distinction between identifying a data inconsistency and establishing its causal role in an application failure.

### F004 — Incorrect Payment State Transition

The Rule-Based Baseline selected a specific state-transition failure category.

The LLM selected a broader payment-state inconsistency category.

The LLM also noted that the supplied evidence did not explicitly establish PaymentIntent correlation between the events.

This suggests that evidence completeness affects diagnostic specificity.

## Limitations

- Only five scenarios were evaluated.
- All five scenarios were used during system development.
- The baseline was designed with knowledge of these cases.
- The LLM was evaluated using a single saved run per scenario.
- Scores were assigned by one reviewer.
- The scoring rubric is preliminary.
- Root-cause observability is not yet measured separately.
- The results do not establish statistical significance or generalisable superiority.

## Next Steps

1. Freeze F001–F005 as development examples.
2. Clarify root-cause observability and category scoring.
3. Create 10–15 new evaluation scenarios.
4. Avoid modifying baseline rules to fit individual evaluation cases.
5. Evaluate both investigators on previously unseen evidence.
6. Review unsupported claims and recommendation quality.
7. Integrate diagnostics into CI without changing test outcomes.

## Conclusion

Both approaches produced useful diagnostic reports for the initial scenarios.

The LLM showed a small advantage in preliminary manual scores for root-cause reasoning and abstention quality.

Further independent evaluation is required before drawing conclusions about diagnostic performance.
