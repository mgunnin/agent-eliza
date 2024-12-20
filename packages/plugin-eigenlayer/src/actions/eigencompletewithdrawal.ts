import type { Action, IAgentRuntime, Memory } from "@ai16z/eliza";
import { ethers } from "ethers";

const DELEGATION_MANAGER = "0xa44151489861fe9e3055d95adc98fbd462b948e7";
const NATIVE_STETH_STRATEGY = "0x7d704507b76571a51d9cae8addabbfd0ba0e63d3";

const delegationManagerABI = [
    "function completeQueuedWithdrawal(address recipient, uint256[] calldata strategyIndexes, address[] calldata strategies, uint256[] calldata shares) external",
    "function getWithdrawalStatus(bytes32 withdrawalRoot) external view returns (bool)",
    // Events
    "event WithdrawalCompleted(address indexed withdrawer, bytes32 withdrawalRoot)",
];

const eigenCompleteWithdrawalAction: Action = {
    name: "EIGEN_COMPLETE_WITHDRAWAL",
    similes: ["COMPLETE_WITHDRAWAL", "FINISH_WITHDRAWAL", "CLAIM_WITHDRAWAL"],
    description: "Completes a queued withdrawal from EigenLayer after the delay period",

    validate: async (_runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text.toLowerCase();
        return text.includes("complete withdrawal") ||
               text.includes("claim withdrawal") ||
               text.includes("finish withdrawal");
    },

    handler: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            const privateKey = process.env.EVM_PRIVATE_KEY;
            const infuraKey = process.env.INFURA_API_KEY;

            if (!privateKey || !infuraKey) {
                console.error("Missing configuration");
                return false;
            }

            const provider = new ethers.JsonRpcProvider(
                `https://holesky.infura.io/v3/${infuraKey}`
            );
            const wallet = new ethers.Wallet(privateKey, provider);

            // Create contract instance
            const delegationManager = new ethers.Contract(
                DELEGATION_MANAGER,
                delegationManagerABI,
                wallet
            );

            // Get withdrawal details from previous state or message
            // This should be stored when queueing the withdrawal
            const withdrawalRoot = message.content.withdrawalRoot;
            if (!withdrawalRoot) {
                console.error("No withdrawal root provided");
                return false;
            }

            // Check if withdrawal is ready
            const isReady = await delegationManager.getWithdrawalStatus(withdrawalRoot);
            if (!isReady) {
                await runtime.messageManager.createMemory({
                    userId: message.userId,
                    roomId: message.roomId,
                    agentId: message.agentId,
                    content: {
                        text: "Withdrawal is not ready yet. Please wait for the escrow period to complete (7 days on mainnet, 10 blocks on testnet).",
                        action: "EIGEN_COMPLETE_WITHDRAWAL",
                    },
                });
                return false;
            }

            // Complete withdrawal
            console.log("Completing withdrawal...");
            const tx = await delegationManager.completeQueuedWithdrawal(
                wallet.address, // recipient
                [0], // strategyIndexes
                [NATIVE_STETH_STRATEGY], // strategies
                [message.content.amount] // shares
            );

            console.log("Transaction submitted:", tx.hash);
            const receipt = await tx.wait();

            await runtime.messageManager.createMemory({
                userId: message.userId,
                roomId: message.roomId,
                agentId: message.agentId,
                content: {
                    text: `Successfully completed withdrawal.\nTransaction: ${tx.hash}`,
                    action: "EIGEN_COMPLETE_WITHDRAWAL",
                },
            });

            return true;
        } catch (error) {
            console.error("Error completing withdrawal:", error);
            return false;
        }
    },

    examples: [[
        {
            user: "{{user1}}",
            content: {
                text: "Complete my EigenLayer withdrawal",
            },
        },
        {
            user: "{{user2}}",
            content: {
                text: "Completing your withdrawal from EigenLayer.",
                action: "EIGEN_COMPLETE_WITHDRAWAL",
            },
        },
    ]],
};

export default eigenCompleteWithdrawalAction;
