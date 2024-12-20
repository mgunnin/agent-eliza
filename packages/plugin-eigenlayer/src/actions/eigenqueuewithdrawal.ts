import type { Action, IAgentRuntime, Memory } from "@ai16z/eliza";
import { ethers } from "ethers";

// Contract addresses (Holesky)
const DELEGATION_MANAGER = "0xa44151489861fe9e3055d95adc98fbd462b948e7";
const STRATEGY_MANAGER = "0xdfb5f6ce42aaa7830e94ecfccad411bef4d4d5b6";
const NATIVE_STETH_STRATEGY = "0x7d704507b76571a51d9cae8addabbfd0ba0e63d3";

// DelegationManager ABI
const delegationManagerABI = [
    "function queueWithdrawals((address[] strategies, uint256[] strategyIndexes, uint256[] shares, address withdrawer)[] queuedWithdrawalParams) external returns (bytes32[])",
    "function getWithdrawalStatus(bytes32 withdrawalRoot) external view returns (bool)",
    "function isDelegated(address staker) external view returns (bool)",
    "function delegatedTo(address staker) external view returns (address)",
    "error WithdrawalAlreadyQueued(bytes32 withdrawalRoot)",
    "error InsufficientShares(uint256 requested, uint256 available)",
    "error InvalidStrategyIndices()",
    "error InvalidWithdrawalAmount()",
    "error PendingWithdrawalExists()",
    "event WithdrawalQueued(address indexed withdrawer, bytes32 withdrawalRoot, (address[] strategies, uint256[] strategyIndexes, uint256[] shares, address withdrawer) withdrawal)"
];

// Strategy Manager ABI
const strategyManagerABI = [
    "function getDeposits(address account) external view returns (address[] memory strategies, uint256[] memory shares)",
    "function stakerStrategyShares(address staker, address strategy) view returns (uint256)",
    "function canWithdraw(address staker, address strategy, uint256 shares) external view returns (bool)",
    "function getDeposits(address account) external view returns (address[] memory strategies, uint256[] memory shares)",
    "error InsufficientShares(uint256 requested, uint256 available)",
    "error StrategyNotPermitted(address strategy)",
    "error WithdrawalNotPermitted()"
];

export const eigenQueueWithdrawalAction: Action = {
    name: "EIGEN_QUEUE_WITHDRAWAL",
    similes: ["QUEUE_WITHDRAWAL", "START_WITHDRAWAL", "INITIATE_WITHDRAWAL", "WITHDRAW_EIGENLAYER", "WITHDRAW_STETH"],
    description: "Queues a withdrawal from EigenLayer strategies",

    validate: async (_runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text.toLowerCase();
        const amountMatch = text.match(/(\d+\.?\d*)\s*(eth|steth)?/i);
        if (!amountMatch) return false;
        message.content.amount = amountMatch[1];
        return text.includes("withdraw") || text.includes("unstake");
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
            const amount = ethers.parseEther(message.content.amount as string);

            console.log("Wallet address:", wallet.address);
            console.log("Amount to withdraw:", ethers.formatEther(amount), "ETH");

            // Create contract instances
            const strategyManager = new ethers.Contract(
                STRATEGY_MANAGER,
                strategyManagerABI,
                wallet
            );

            const delegationManager = new ethers.Contract(
                DELEGATION_MANAGER,
                delegationManagerABI,
                wallet
            );

            // Get current deposits and shares
            const userDeposits = await strategyManager.getDeposits(wallet.address);
            console.log("Current deposits:", userDeposits);

            // Check if wallet is delegated and get operator
            const [isDelegated, operator] = await Promise.all([
                delegationManager.isDelegated(wallet.address),
                delegationManager.delegatedTo(wallet.address)
            ]);
            console.log("Is wallet delegated:", isDelegated);
            console.log("Delegated to operator:", operator);

            if (!isDelegated) {
                throw new Error("Wallet is not delegated");
            }

            if (operator.toLowerCase() !== wallet.address.toLowerCase()) {
                throw new Error("Wallet is delegated to a different operator");
            }

            // Get user shares
            const userShares = BigInt(userDeposits.shares[0]);
            console.log("User shares:", userShares.toString());

            // Calculate share amount to withdraw based on proportion
            const requestedAmount = ethers.parseEther(message.content.amount as string);
            console.log("Requested amount in ETH:", message.content.amount);

            // Calculate proportion of shares to withdraw (0.01 ETH / 1 ETH = 0.01)
            const proportion = (BigInt(requestedAmount) * BigInt(1e18)) / ethers.parseEther("1.0");
            const shareAmount = (userShares * proportion) / BigInt(1e18);
            console.log("Share amount to withdraw:", shareAmount.toString());

            // Validate withdrawal amount
            if (shareAmount > userShares) {
                throw new Error(`Insufficient shares. You have ${ethers.formatEther(userShares.toString())} shares but trying to withdraw ${ethers.formatEther(shareAmount.toString())} shares.`);
            }

            if (shareAmount <= BigInt(0)) {
                throw new Error("Share amount must be greater than 0");
            }

            // Create withdrawal params struct with explicit BigInt conversions
            const withdrawalParams = [{
                strategies: [NATIVE_STETH_STRATEGY],
                strategyIndexes: [0],
                shares: [shareAmount],
                withdrawer: wallet.address
            }];

            console.log("Raw withdrawal params:", withdrawalParams[0]);
            console.log("Connected contract address:", delegationManager.target);

            try {
                // Send the transaction with higher gas limit
                console.log("Sending transaction...");
                const tx = await delegationManager.queueWithdrawals(
                    withdrawalParams,
                    {
                        gasLimit: 2000000,
                        maxFeePerGas: ethers.parseUnits("50", "gwei"),
                        maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
                    }
                );

                console.log("Transaction submitted:", tx);
                const receipt = await tx.wait();
                console.log("Transaction confirmed in block:", receipt.blockNumber);

                // Create success response
                const response = {
                    hash: tx.hash,
                    from: wallet.address,
                    amount: ethers.formatEther(shareAmount)
                };

                await runtime.messageManager.createMemory({
                    userId: message.userId,
                    roomId: message.roomId,
                    agentId: message.agentId,
                    content: {
                        text: `Successfully queued withdrawal of ${message.content.amount} ETH from EigenLayer\nTransaction hash: ${response.hash}`,
                        action: "EIGEN_QUEUE_WITHDRAWAL"
                    },
                });

                return true;
            } catch (error) {
                console.error("Transaction error:", {
                    message: error.message,
                    code: error.code,
                    data: error.data,
                    reason: error.reason
                });

                let errorMessage = "Failed to queue withdrawal. ";
                if (error.code === "ACTION_REJECTED") {
                    errorMessage += "Transaction was rejected by user.";
                } else if (error.code === "INSUFFICIENT_FUNDS") {
                    errorMessage += "Insufficient funds for gas.";
                } else if (error.code === "CALL_EXCEPTION") {
                    errorMessage += "The transaction would fail. This could be due to insufficient shares or pending withdrawals.";
                } else {
                    errorMessage += error.message || "Unknown error occurred.";
                }

                await runtime.messageManager.createMemory({
                    userId: message.userId,
                    roomId: message.roomId,
                    agentId: message.agentId,
                    content: {
                        text: errorMessage,
                        action: "EIGEN_QUEUE_WITHDRAWAL"
                    },
                });

                return false;
            }
        } catch (error) {
            console.error("Error:", error);
            throw error;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to withdraw 0.1 ETH from EigenLayer",
                    amount: "0.1",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Queuing your withdrawal from EigenLayer.",
                    action: "EIGEN_QUEUE_WITHDRAWAL",
                },
            },
        ],
    ],
};

export default eigenQueueWithdrawalAction;
