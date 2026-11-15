
import type { IncidentEvidence } from './incident-evidence.js';

// Fields whose values must never appear in diagnostic evidence.
const sensitiveFields = new Set([
  'authorization',
  'apikey',
  'xapikey',
  'clientsecret',
  'webhooksecret',
  'secret',
  'secretkey',
  'password',
  'passphrase',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'privatekey',
  'cookie',
  'setcookie',
  'cardnumber',
  'cvc',
  'cvv'
]);

// Check field names regardless of case, underscores or hyphens.
function isSensitiveField(name: string): boolean {
  const normalisedName = name
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

  return sensitiveFields.has(normalisedName);
}

// Remove recognised secrets and email addresses from text.
function sanitiseText(text: string): string {
  return text
    .replace(
      /\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9_-]+\b/g,
      '[REDACTED_STRIPE_KEY]'
    )
    .replace(
      /\bwhsec_[A-Za-z0-9_-]+\b/g,
      '[REDACTED_WEBHOOK_SECRET]'
    )
    .replace(
      /\bpi_[A-Za-z0-9]+_secret_[A-Za-z0-9_-]+\b/g,
      '[REDACTED_CLIENT_SECRET]'
    )
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
      'Bearer [REDACTED_TOKEN]'
    )
    .replace(
      /\b(Authorization\s*:\s*Basic\s+)[A-Za-z0-9+/=]+/gi,
      '$1[REDACTED_TOKEN]'
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      '[REDACTED_EMAIL]'
    );
}

// Recursively sanitise objects, arrays and strings.
function sanitiseValue(
  value: unknown,
  fieldName?: string
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Hide the entire value of a sensitive field.
  if (fieldName && isSensitiveField(fieldName)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return sanitiseText(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitiseValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitiseValue(item, key)
      ])
    );
  }

  // Preserve numbers and booleans.
  return value;
}

// Return a sanitised copy without modifying the original.
export function sanitiseEvidence(
  evidence: IncidentEvidence
): IncidentEvidence {
  return sanitiseValue(evidence) as IncidentEvidence;
}
