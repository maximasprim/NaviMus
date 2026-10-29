import { isProduction } from "@travel/config";
import { PaymentError } from "@travel/types";
import type { PaymentProvider } from "./payment-provider.js";
import { MpesaProvider } from "./mpesa-provider.js";
import { StripeProvider } from "./stripe-provider.js";
import { MockPaymentProvider } from "./mock-payment-provider.js";

const providers: Record<string, PaymentProvider> = {
  mpesa: new MpesaProvider(),
  stripe: new StripeProvider(),
  mock: new MockPaymentProvider(),
};

/**
 * The only place that maps a provider name string to a concrete
 * implementation. Booking/checkout code calls this rather than
 * importing MpesaProvider/StripeProvider directly, so adding a
 * new provider never requires touching the Payment service's
 * business logic.
 *
 * The "mock" provider is hard-blocked in production regardless of
 * what a caller requests - this is the single enforcement point,
 * so no route or service method can accidentally accept a mock
 * payment for a real booking.
 */
export function getPaymentProvider(name: string): PaymentProvider {
  if (name === "mock" && isProduction()) {
    throw new PaymentError("The mock payment provider is not available in production");
  }
  const provider = providers[name];
  if (!provider) {
    throw new PaymentError(`Unsupported payment provider: ${name}`);
  }
  return provider;
}

export * from "./payment-provider.js";
