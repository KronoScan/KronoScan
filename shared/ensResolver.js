import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
const TEXT_KEYS = [
    "description",
    "url",
    "com.kronoscan.categories",
    "com.kronoscan.price",
    "com.kronoscan.network",
    "com.kronoscan.payment",
    "com.kronoscan.scan-modes",
    "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]",
];
export async function resolveService(ensName, sepoliaRpc) {
    const client = createPublicClient({
        chain: sepolia,
        transport: http(sepoliaRpc),
    });
    const address = await client.getEnsAddress({
        name: normalize(ensName),
    });
    if (!address) {
        return null;
    }
    const records = {};
    for (const key of TEXT_KEYS) {
        records[key] = await client.getEnsText({
            name: normalize(ensName),
            key,
        });
    }
    return {
        sellerAddress: address,
        apiUrl: records["url"] ?? "",
        description: records["description"] ?? "",
        categories: parseList(records["com.kronoscan.categories"]),
        pricePerRequest: records["com.kronoscan.price"] ?? "",
        network: records["com.kronoscan.network"] ?? "",
        paymentProtocol: records["com.kronoscan.payment"] ?? "",
        scanModes: parseList(records["com.kronoscan.scan-modes"]),
        ensip25: (records["agent-registration[0x0000000000000000000000000000000000000000][audit-v1]"] ?? "") !== "",
    };
}
function parseList(value) {
    if (!value)
        return [];
    return value.split(",").map((s) => s.trim()).filter(Boolean);
}
