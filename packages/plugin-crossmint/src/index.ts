import type { Plugin } from "@ai16z/eliza";
import { getOnChainActions } from "./actions";
import { getWalletClientAndConnection, getWalletProvider } from "./wallet";
import { splToken } from "@goat-sdk/plugin-spl-token";
import { sendSOL } from "@goat-sdk/core";
import { jupiter } from "@goat-sdk/plugin-jupiter";
import { crossmint } from "@goat-sdk/crossmint";
async function createCrossmintPlugin(
    getSetting: (key: string) => string | undefined
): Promise<Plugin> {
    const { walletClient, connection } = await getWalletClientAndConnection(getSetting);
    if (!walletClient) {
        throw new Error("Wallet client not found");
    }

    const { mint } = crossmint(getSetting("CROSSMINT_API_KEY"));

    console.log("walletClient", walletClient);
    const actions = await getOnChainActions({
        wallet: walletClient,
        // Add plugins here based on what actions you want to use
        // See all available plugins at https://ohmygoat.dev/chains-wallets-plugins#plugins
        plugins: [
            // Add you solana plugins here
            sendSOL(),
            jupiter(),
            splToken({
                connection,
                network: "mainnet",
            }),
            mint(),
            // coingecko({
            //  apiKey: getSetting("COINGECKO_API_KEY")
            // })
        ],
    });

    return {
        name: "[Crossmint] Solana Onchain Actions",
        description: "Crossmint Solana integration plugin",
        providers: [getWalletProvider(walletClient)],
        evaluators: [],
        services: [],
        actions: actions,
    };
}

export default createCrossmintPlugin;
