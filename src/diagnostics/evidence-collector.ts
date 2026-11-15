
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { TestInfo } from '@playwright/test';

import type { IncidentEvidence } from './incident-evidence.js';
import { sanitiseEvidence } from './sanitise-evidence.js';

export class EvidenceCollector {
  readonly evidence: IncidentEvidence;
  private saved = false;

  constructor(private readonly testInfo: TestInfo) {
    this.evidence = {
      incidentId: randomUUID(),
      testName: testInfo.title,
      collectedAt: new Date().toISOString(),

      stripe: {
        paymentStatus: null,
        responseHttpStatus: null
      },

      database: {
        orderStatus: null,
        paymentIntentMatches: null,
        amountMatches: null,
        currencyMatches: null
      },

      webhooks: {
        recordedEventCount: null,
        deliveryHttpStatus: null
      },

      application: {
        logs: null,
        errors: null
      }
    };
  }

  async save(): Promise<boolean> {
    // Avoid saving the same incident twice.
    if (this.saved) {
      return true;
    }

    try {
      this.evidence.collectedAt = new Date().toISOString();

      // Sanitise before writing anything to disk.
      const safeEvidence = sanitiseEvidence(this.evidence);

      const evidencePath = this.testInfo.outputPath(
        'incident-evidence.json'
      );

      await writeFile(
        evidencePath,
        JSON.stringify(safeEvidence, null, 2),
        'utf8'
      );

      await this.testInfo.attach('incident-evidence.json', {
        path: evidencePath,
        contentType: 'application/json'
      });

      this.saved = true;
      return true;
    } catch {
      // Evidence collection must not change test results.
      console.warn('Could not save incident evidence');
      return false;
    }
  }
}
