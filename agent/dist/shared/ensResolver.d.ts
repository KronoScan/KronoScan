export interface ServiceConfig {
    sellerAddress: string;
    apiUrl: string;
    description: string;
    categories: string[];
    pricePerRequest: string;
    network: string;
    paymentProtocol: string;
    scanModes: string[];
    ensip25: boolean;
}
export declare function resolveService(ensName: string, sepoliaRpc: string): Promise<ServiceConfig | null>;
