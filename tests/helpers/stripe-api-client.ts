
import type { APIRequestContext, APIResponse } from '@playwright/test';

type CreatePaymentIntentInput = {
  amount: number;
  currency: string;
};

export class StripeApiClient {
  constructor(private readonly request: APIRequestContext) {}

  createPaymentIntent(input: CreatePaymentIntentInput, idempotencyKey?: string): Promise<APIResponse> {
    return this.request.post('/v1/payment_intents', {
      headers: idempotencyKey
        ? { 'Idempotency-Key': idempotencyKey}
        : undefined,
      form: {
        amount: input.amount,
        currency: input.currency,
        'automatic_payment_methods[enabled]': 'true',
        'automatic_payment_methods[allow_redirects]': 'never'
      }
    });
  }
  retrievePaymentIntent(id: string): Promise<APIResponse> {
    return this.request.get(`/v1/payment_intents/${encodeURIComponent(id)}`);
  }

  confirmPaymentIntent(id: string,paymentMethod = 'pm_card_visa'): Promise<APIResponse> {
  return this.request.post(
    `/v1/payment_intents/${encodeURIComponent(id)}/confirm`,
    {
      form: {payment_method: paymentMethod}
    });
  }

  createRefund(paymentIntentId: string, amount?: number): Promise<APIResponse> {
    const form: Record<string, string> = {payment_intent: paymentIntentId};
    if (amount !== undefined) {form.amount = String(amount);}
    return this.request.post('/v1/refunds', { form });
  };
  retrieveRefund(refundId: string): Promise<APIResponse> {
    return this.request.get(`/v1/refunds/${encodeURIComponent(refundId)}`);
  }

  cancelPaymentIntent(id: string): Promise<APIResponse> {
    return this.request.post(`/v1/payment_intents/${encodeURIComponent(id)}/cancel`);
  }
  retrieveCharge(chargeId: string): Promise<APIResponse> {
    return this.request.get(`/v1/charges/${encodeURIComponent(chargeId)}`);
  }
}
