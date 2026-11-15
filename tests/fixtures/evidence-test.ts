
import { test as base, expect } from '@playwright/test';
import { EvidenceCollector } from '../../src/diagnostics/evidence-collector.js';
import { getFailureMessages } from '../../src/diagnostics/playwright-failure.js';

type EvidenceFixtures = {
  evidenceCollector: EvidenceCollector;
};

export const test = base.extend<EvidenceFixtures>({
  evidenceCollector: [
    async ({}, use, testInfo) => {
      const collector = new EvidenceCollector(testInfo);

      // Make the collector available during the test.
      await use(collector);

      // Automatically collect evidence on unexpected failure.
      const failureMessages = getFailureMessages(testInfo);
      if (failureMessages) {
        collector.evidence.application.errors = failureMessages;
        await collector.save();
      }
    },
    { auto: true }
  ]
});

export { expect };
