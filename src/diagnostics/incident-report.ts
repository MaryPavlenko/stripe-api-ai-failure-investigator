
export type DiagnosisDecision =
  | 'root_cause_identified'
  | 'insufficient_evidence';

export type ConfidenceLevel =
  | 'low'
  | 'medium'
  | 'high';

export interface IncidentReport {
  decision: DiagnosisDecision;

  summary: string;

  failureCategory: string | null;

  probableRootCause: string | null;

  confidence: ConfidenceLevel;

  supportingEvidence: string[];

  recommendations: string[];
}
