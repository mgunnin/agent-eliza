import type { Memory, Provider } from "@ai16z/eliza";
import type { AgentRuntime } from "@ai16z/eliza";
import fetch from 'node-fetch';

const API_BASE_URL = 'https://api-holesky.eigenexplorer.com';

interface OperatorData {
    address: string;
    metadataName?: string;
    metadataDescription?: string;
    metadataWebsite?: string;
    totalStakers: number;
    totalAvs: number;
    apy: string;
    shares: Array<{
        strategyAddress: string;
        shares: string;
    }>;
    avsRegistrations: Array<{
        avsAddress: string;
        isActive: boolean;
    }>;
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
    return (Number(num) / 1e18).toFixed(2);
}

async function fetchOperatorData(operatorAddress: string): Promise<OperatorData | null> {
    try {
        console.log('Fetching operator data for:', operatorAddress);
        const response = await fetch(`${API_BASE_URL}/operators/${operatorAddress}`);
        if (response.status === 404) {
            console.log('Operator not found');
            return null;
        }
        if (response.status === 500) {
            console.log('Internal server error while fetching operator data');
            throw new Error('Internal server error');
        }
        if (!response.ok) {
            console.log(`Operator data fetch failed: ${response.status} - ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        console.log('Operator data received:', data);
        return data;
    } catch (error) {
        console.error('Error fetching operator data:', error);
        throw error;
    }
}

export const operatorProvider: Provider = {
    get: async (runtime: AgentRuntime, message: Memory) => {
        const text = typeof message.content === 'object' && 'text' in message.content
            ? message.content.text.toLowerCase()
            : String(message.content).toLowerCase();

        if (!text.includes('operator') || !text.includes('status')) {
            return null;
        }

        const address = extractAddress(text);
        if (!address) {
            return "Please provide a valid operator address (0x...)";
        }

        try {
            console.log('Processing operator query for:', address);
            const operatorData = await fetchOperatorData(address);
            if (!operatorData) {
                return `No operator found for address ${address}. Please verify the address and try again.`;
            }

            const totalShares = formatBigNumber(calculateTotalShares(operatorData.shares));
            return `EigenLayer Operator Status for ${operatorData.metadataName || address}:\n` +
                `${operatorData.metadataDescription ? `Description: ${operatorData.metadataDescription}\n` : ''}` +
                `- Total Stakers: ${operatorData.totalStakers.toLocaleString()}\n` +
                `- Total AVS: ${operatorData.totalAvs}\n` +
                `- APY: ${operatorData.apy}%\n` +
                `- Total Shares: ${totalShares} ETH\n` +
                `${operatorData.metadataWebsite ? `- Website: ${operatorData.metadataWebsite}\n` : ''}` +
                `- Active AVS Services: ${operatorData.avsRegistrations.filter(avs => avs.isActive).length}`;
        } catch (error) {
            console.error('Error processing operator query:', error);
            if (error instanceof Error && error.message === 'Internal server error') {
                return "Unable to fetch operator data at the moment due to a server error. Please try again later.";
            }
            return "An unexpected error occurred while fetching operator data. Please try again later.";
        }
    }
};
