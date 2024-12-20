import { WalletClient } from "@goat-sdk/core";
import { Connection } from "@solana/web3.js";
import { crossmint } from "@goat-sdk/crossmint";
import { formatUnits } from "viem";

export async function getWalletClientAndConnection(
    getSetting: (key: string) => string | undefined
) {
    const apiKey = getSetting("CROSSMINT_API_KEY");
    if (!apiKey) {
        throw new Error("Missing CROSSMINT_API_KEY variable");
    }
    const email = getSetting("CROSSMINT_EMAIL");
    if (!email) {
        throw new Error("Missing CROSSMINT_EMAIL variable");
    }
    const env = getSetting("CROSSMINT_ENV");
    if (!env) {
        throw new Error("Missing CROSSMINT_ENV variable");
    }
    const RPC_URL = getSetting("RPC_URL");
    if (!RPC_URL) {
        throw new Error("Missing RPC_URL variable");
    }

    const { custodial } = crossmint(apiKey);

    const connection = new Connection(RPC_URL, "confirmed");

    return {
        walletClient: await custodial({
            chain: "solana",
            email: email,
            connection: connection,
        }),
        connection: connection,
    };
}

export function getWalletProvider(walletClient: WalletClient) {
    return {
        async get(): Promise<string | null> {
            try {
                const address = walletClient.getAddress();
                const balance = await walletClient.balanceOf(address);
                console.log("address", address);
                console.log("balance", balance);
                const balanceInSOL = formatUnits(balance.value, balance.decimals);
                return `Solana Wallet Address: ${address}\nBalance: ${balanceInSOL} SOL`;
            } catch (error) {
                console.error("Error in Solana wallet provider:", error);
                return null;
            }
        },
    };
}
