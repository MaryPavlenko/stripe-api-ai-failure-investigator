import type { OrderStatus } from '../types.js';

export interface IncidentEvidence {
  incidentId: string;
  testName: string;
  collectedAt: string;

  stripe: {
    paymentStatus: string | null;
    responseHttpStatus: number | null;
  };

  database: {
    orderStatus: OrderStatus | null;
    paymentIntentMatches: boolean | null;
    amountMatches: boolean | null;
    currencyMatches: boolean | null;
  };

  webhooks: {
    recordedEventCount: number | null;
    deliveryHttpStatus: number | null;
  };

  application: {
    logs: string[] | null;
    errors: string[] | null;
  };
}