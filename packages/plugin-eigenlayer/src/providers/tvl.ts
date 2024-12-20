import type { Memory, Provider } from "@ai16z/eliza";
import type { AgentRuntime } from "@ai16z/eliza";
import fetch from 'node-fetch';

const API_BASE_URL = 'https://api-holesky.eigenexplorer.com';

interface TvlData {
    tvl: number;
}

async function fetchTvlData(): Promise<TvlData | null> {
    try {
        console.log('Fetching TVL data...');
        const response = await fetch(`${API_BASE_URL}/metrics/tvl`);
        if (response.status === 404) {
            console.log('TVL endpoint not found');
            return null;
        }
        if (response.status === 500) {
            console.log('Internal server error while fetching TVL');
            throw new Error('Internal server error');
        }
        if (!response.ok) {
            console.log(`TVL fetch failed: ${response.status}`);
            return null;
        }
        const data = await response.json();
        console.log('TVL data received:', data);
        return data;
    } catch (error) {
        console.error('Error fetching TVL data:', error);
        throw error;
    }
}

export const tvlProvider: Provider = {
    get: async (runtime: AgentRuntime, message: Memory) => {
        const text = typeof message.content === 'object' && 'text' in message.content
            ? message.content.text.toLowerCase()
            : String(message.content).toLowerCase();

        if (!text.includes('tvl') || !text.includes('eigenlayer')) {
            return null;
        }

        try {
            const tvlData = await fetchTvlData();
            if (!tvlData) {
                return "Unable to fetch TVL data at the moment.";
            }

            return `The current Total Value Locked (TVL) in EigenLayer is $${tvlData.tvl.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
        } catch (error) {
            console.error('Error in TVL provider:', error);
            return "Unable to fetch TVL data at the moment due to a server error. Please try again later.";
        }
    }
};
