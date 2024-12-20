import type { Memory, Provider } from "@ai16z/eliza";
import type { AgentRuntime } from "@ai16z/eliza";
import fetch from 'node-fetch';
import { Wallet, ethers } from 'ethers';

const API_BASE_URL = 'https://api-holesky.eigenexplorer.com';
const STRATEGY_MANAGER = '0xdfb5f6ce42aaa7830e94ecfccad411bef4d4d5b6';
const NATIVE_STETH_STRATEGY = '0x7d704507b76571a51d9cae8addabbfd0ba0e63d3';

// Strategy Manager ABI for fetching deposits
const strategyManagerABI = [
    "function getDeposits(address account) external view returns (address[] memory strategies, uint256[] memory shares)",
    "function isDelegated(address staker) external view returns (bool)",
    "function delegatedTo(address staker) external view returns (address)"
];

interface StakerData {
    address: string;
    operatorAddress: string;
    shares: Array<{
        strategyAddress: string;
        shares: string;
    }>;
    createdAt: string;
    updatedAt: string;
}

interface OnChainStakerData {
    shares: string;
    strategy: string;
    isDelegated: boolean;
    operatorAddress?: string;
}

function extractAddress(text: string): string | null {
    const matches = text.match(/0x[a-fA-F0-9]{40}/);
    return matches ? matches[0] : null;
}

function calculateTotalShares(shares: Array<{ shares: string }>): string {
    return shares.reduce((total, current) => {
        const currentShares = BigInt(current.shares);
        return (BigInt(total) + currentShares).toString();
    }, "0");
}

function formatBigNumber(value: string): string {
    const num = BigInt(value);
    return (Number(num) / 1e18).toFixed(4);
}

async function fetchStakerData(stakerAddress: string, retryCount = 3): Promise<StakerData | null> {
    for (let i = 0; i < retryCount; i++) {
        try {
            console.log(`Fetching staker data for: ${stakerAddress} (attempt ${i + 1}/${retryCount})`);
            const response = await fetch(`${API_BASE_URL}/stakers/${stakerAddress}`);

            if (response.status === 404) {
                console.log('Staker not found in API - will try on-chain data');
                return null;
            }
            if (response.status === 500) {
                console.log('Internal server error while fetching staker data - will retry or fallback to on-chain');
                if (i === retryCount - 1) throw new Error('Internal server error');
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            if (!response.ok) {
                console.log(`Staker data fetch failed: ${response.status} - ${response.statusText}`);
                return null;
            }
            const data = await response.json();
            console.log('Staker data received:', data);
            return data;
        } catch (error) {
            console.error(`Error fetching staker data (attempt ${i + 1}/${retryCount}):`, error);
            if (i === retryCount - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return null;
}

async function getOnChainStakerData(address: string): Promise<OnChainStakerData | null> {
    try {
        const infuraKey = process.env.INFURA_API_KEY;
        if (!infuraKey) {
            console.log('No Infura API key found');
            return null;
        }

        const provider = new ethers.JsonRpcProvider(`https://holesky.infura.io/v3/${infuraKey}`);
        const strategyManager = new ethers.Contract(STRATEGY_MANAGER, strategyManagerABI, provider);

        // Fetch all data in parallel
        const [
            [strategies, shares],
            isDelegated,
            operatorAddress
        ] = await Promise.all([
            strategyManager.getDeposits(address),
            strategyManager.isDelegated(address),
            strategyManager.delegatedTo(address).catch(() => null)
        ]);

        if (!strategies.length) return null;

        // Find the stETH strategy
        const strategyIndex = strategies.findIndex(s =>
            s.toLowerCase() === NATIVE_STETH_STRATEGY.toLowerCase()
        );

        if (strategyIndex === -1) return null;

        return {
            strategy: strategies[strategyIndex],
            shares: shares[strategyIndex].toString(),
            isDelegated,
            operatorAddress: operatorAddress || undefined
        };
    } catch (error) {
        console.error('Error fetching on-chain data:', error);
        return null;
    }
}

function formatWalletStatus(address: string, data: OnChainStakerData): string {
    const lines = [
        'EigenLayer Wallet Status',
        `Address: ${address}`,
        `Total Staked: ${formatBigNumber(data.shares)} ETH`,
        `Strategy: stETH (${data.strategy})`,
        `Delegation Status: ${data.isDelegated ? 'Delegated' : 'Not Delegated'}`
    ];

    if (data.operatorAddress) {
        lines.push(`Delegated To: ${data.operatorAddress}`);
    }

    lines.push('Note: Using on-chain data as API data is still indexing');
    return lines.join('\n');
}

export const stakerProvider: Provider = {
    get: async (runtime: AgentRuntime, message: Memory) => {
        const text = typeof message.content === 'object' && 'text' in message.content
            ? message.content.text.toLowerCase()
            : String(message.content).toLowerCase();

        // Handle wallet status query
        if (text.includes('wallet') && text.includes('status')) {
            try {
                console.log('Processing wallet status query');
                const privateKey = process.env.EVM_PRIVATE_KEY;
                if (!privateKey) {
                    return 'Wallet not configured. Please set your EVM_PRIVATE_KEY in environment variables to check your wallet status.';
                }

                const wallet = new Wallet(privateKey);
                const address = wallet.address;
                console.log('Wallet address:', address);

                // Try API first
                const stakerData = await fetchStakerData(address);

                // If API fails, try on-chain data
                if (!stakerData) {
                    console.log('Falling back to on-chain data');
                    const onChainData = await getOnChainStakerData(address);

                    if (onChainData) {
                        return formatWalletStatus(address, onChainData);
                    }

                    return `No stakes found for ${address}. If you just made a deposit, please wait a few minutes for it to be indexed.`;
                }

                const totalShares = formatBigNumber(calculateTotalShares(stakerData.shares));
                const lines = [
                    'EigenLayer Wallet Status',
                    `Address: ${address}`,
                    `Total Staked: ${totalShares} ETH`,
                    `Delegated to Operator: ${stakerData.operatorAddress}`,
                    `Last Activity: ${new Date(stakerData.updatedAt).toLocaleDateString()}`
                ];
                return lines.join('\n');
            } catch (error) {
                console.error('Error processing wallet query:', error);
                return 'Unable to fetch your wallet status at the moment. Your deposits are safe on-chain, but we are having trouble accessing the data. Please try again in a few minutes.';
            }
        }

        // Handle staker query
        if (!text.includes('staker') || !text.includes('status')) {
            return null;
        }

        const address = extractAddress(text);
        if (!address) {
            return 'Please provide a valid staker address (0x...) to check their status.';
        }

        try {
            console.log('Processing staker query for:', address);
            const stakerData = await fetchStakerData(address);
            if (!stakerData) {
                const onChainData = await getOnChainStakerData(address);
                if (onChainData) {
                    return formatWalletStatus(address, onChainData);
                }
                return `No staking activity found for ${address}. This address is not currently staking in EigenLayer or the deposits have not been indexed yet.`;
            }

            const totalShares = formatBigNumber(calculateTotalShares(stakerData.shares));
            const lines = [
                'EigenLayer Staker Status',
                `Address: ${address}`,
                `Total Staked: ${totalShares} ETH`,
                `Delegated to Operator: ${stakerData.operatorAddress}`,
                `Started Staking: ${new Date(stakerData.createdAt).toLocaleDateString()}`,
                `Last Activity: ${new Date(stakerData.updatedAt).toLocaleDateString()}`
            ];
            return lines.join('\n');
        } catch (error) {
            console.error('Error processing staker query:', error);
            return 'Unable to fetch staker information. The deposits are safe on-chain, but we are having trouble accessing the data. Please try again later.';
        }
    }
};
