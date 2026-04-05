type PaymentFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
export declare function getPaymentMode(): "x402-sdk" | "fallback";
export declare function createPaymentFetch(): Promise<PaymentFetch>;
export {};
