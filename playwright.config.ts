
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 15_000,
  retries: 0,
  fullyParallel: false,

  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],

  use: {
    trace: 'retain-on-failure'
  },

  projects: [
    {
      name: 'local',
      testMatch: [
        '**/api.spec.ts',
        '**/sanitise-evidence.spec.ts',
        '**/evidence-collector.spec.ts',
        '**/fault-injection.spec.ts'
      ]
    },
    {
      name: 'stripe-sandbox',
      testMatch: '**/stripe-sandbox.spec.ts',
      workers: 1,
      use: {
        trace: 'off'
      }
    },
    {
      name: 'postgres',
      testMatch: '**/webhook-postgres.spec.ts',
      workers: 1
    },
    {
      name: 'data-consistency',
      testMatch: '**/payment-consistency.spec.ts',
      workers: 1,
      use: {
        trace: 'off'
      }
    }
  ]
});
