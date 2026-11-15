
import type { TestInfo } from '@playwright/test';

type FailureInfo = Pick<
  TestInfo,
  'status' | 'expectedStatus' | 'errors'
>;

export function getFailureMessages(
  info: FailureInfo
): string[] | null {
  if (info.status === info.expectedStatus) {
    return null;
  }

  const errors = info.errors
    .map(error => error.message?.split('\n')[0] ?? 'Unknown test error')
    .slice(0, 5);

  return [
    `Unexpected Playwright status: ${info.status}`,
    ...errors
  ];
}
