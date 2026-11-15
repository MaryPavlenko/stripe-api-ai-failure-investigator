
import type { APIRequestContext, APIResponse } from '@playwright/test';

type CreatePaymentIntentInput = {
  amount: number;
  currency: string;
};

export class StripeApiClient {
  constructor(private readonly request: APIRequestContext) {}

  createPaymentIntent(input: CreatePaymentIntentInput): Promise<APIResponse> {
    return this.request.post('/v1/payment_intents', {
      form: {
        amount: input.amount,
        currency: input.currency,
        'automatic_payment_methods[enabled]': 'true'
      }
    });
  }

  retrievePaymentIntent(id: string): Promise<APIResponse> {
    return this.request.get(`/v1/payment_intents/${encodeURIComponent(id)}`);
  }

  cancelPaymentIntent(id: string): Promise<APIResponse> {
    return this.request.post(
      `/v1/payment_intents/${encodeURIComponent(id)}/cancel`
    );
  }
}
