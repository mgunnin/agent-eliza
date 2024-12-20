import type { Action, IAgentRuntime, Memory } from "@ai16z/eliza";
import { ethers } from "ethers";

// Updated Holesky contract addresses in lowercase
const EIGEN_STRATEGY_MANAGER = "0xdfb5f6ce42aaa7830e94ecfccad411bef4d4d5b6";
const NATIVE_STETH_STRATEGY = "0x7d704507b76571a51d9cae8addabbfd0ba0e63d3";
const DELEGATION_MANAGER = "0xa44151489861fe9e3055d95adc98fbd462b948e7";
const STETH_TOKEN = "0x3f1c547b21f65e10480de3ad8e19faac46c95034";

// ERC20 ABI for stETH
const erc20ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
];

// Strategy Manager ABI
const strategyManagerABI = [
    "function getDeposits(address account) external view returns (address[] memory strategies, uint256[] memory shares)",
    "function depositIntoStrategy(address strategy, address token, uint256 amount) external returns (uint256 shares)",
    // Events
    "event Deposit(address indexed depositor, address indexed token, address indexed strategy, uint256 shares)",
    // Common errors
    "error StrategyNotWhitelisted(address strategy)",
    "error InvalidAmount()",
    "error InsufficientBalance()",
    "error StrategyNotAcceptingDeposits(address strategy)",
    "error InvalidStrategy(address strategy)",
    "error MaxPerDepositExceeded(uint256 amount, uint256 maxPerDeposit)",
    "error MaxTotalDepositsExceeded(uint256 totalDeposits, uint256 maxTotalDeposits)",
];

// Delegation Manager ABI
const delegationManagerABI = [
    "function isDelegated(address staker) external view returns (bool)",
    "function isOperator(address operator) external view returns (bool)",
];

// Strategy ABI for TVL limits
const strategyABI = [
    "function name() external view returns (string)",
    "function symbol() external view returns (string)",
    "function totalShares() external view returns (uint256)",
    "function sharesToUnderlyingView(uint256 shares) external view returns (uint256)",
    "function underlyingToSharesView(uint256 underlying) external view returns (uint256)",
    "function maxPerDeposit() external view returns (uint256)",
    "function maxTotalDeposits() external view returns (uint256)",
    "function _tokenBalance() external view returns (uint256)",
];

const eigenDepositAction: Action = {
    name: "EIGEN_DEPOSIT",
    similes: ["DEPOSIT_EIGEN", "STAKE_ETH", "RESTAKE_ETH"],
    description: "Deposits ETH into EigenLayer for restaking",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text.toLowerCase();
        const amountMatch = text.match(/\d+\.?\d*/);
        if (!amountMatch) return false;
        message.content.amount = amountMatch[0];
        return (
            text.includes("deposit") ||
            text.includes("stake") ||
            text.includes("restake")
        );
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
            console.log("Amount in Wei:", amount.toString());

            // Check wallet balance
            const balance = await provider.getBalance(wallet.address);
            console.log("Wallet balance:", ethers.formatEther(balance), "ETH");

            if (balance < amount) {
                console.error("Insufficient balance");
                return false;
            }

            // Attempt deposit
            console.log("Preparing deposit transaction...");
            console.log("Parameters:", {
                strategy: NATIVE_STETH_STRATEGY,
                amount: amount.toString(),
                wallet: wallet.address,
            });

            try {
                // Check stETH balance and allowance
                const stETH = new ethers.Contract(
                    STETH_TOKEN,
                    erc20ABI,
                    wallet
                );
                const stETHBalance = await stETH.balanceOf(wallet.address);
                console.log(
                    "stETH balance:",
                    ethers.formatEther(stETHBalance),
                    "stETH"
                );

                if (stETHBalance < amount) {
                    console.error("Insufficient stETH balance");
                    return false;
                }

                // Check current allowance
                const currentAllowance = await stETH.allowance(
                    wallet.address,
                    EIGEN_STRATEGY_MANAGER
                );
                console.log(
                    "Current allowance:",
                    ethers.formatEther(currentAllowance)
                );

                // Create contract instances
                const strategyManager = new ethers.Contract(
                    EIGEN_STRATEGY_MANAGER,
                    strategyManagerABI,
                    wallet
                );

                const delegationManager = new ethers.Contract(
                    DELEGATION_MANAGER,
                    delegationManagerABI,
                    wallet
                );

                // Check delegation status
                console.log("Checking delegation status...");
                const [isDelegated, isOperator] = await Promise.all([
                    delegationManager.isDelegated(wallet.address),
                    delegationManager.isOperator(wallet.address),
                ]);

                console.log("Delegation status:", {
                    isDelegated,
                    isOperator,
                    wallet: wallet.address,
                });

                // Get current deposits
                const currentDeposits = await strategyManager.getDeposits(
                    wallet.address
                );
                console.log("Current deposits:", currentDeposits);

                // Prepare transaction
                console.log("Preparing deposit transaction...");
                console.log("Parameters:", {
                    strategy: NATIVE_STETH_STRATEGY,
                    amount: amount.toString(),
                    wallet: wallet.address,
                });

                try {
                    // First try to get more information about the strategy
                    console.log("Checking strategy status...");
                    const strategyContract = new ethers.Contract(
                        NATIVE_STETH_STRATEGY,
                        strategyABI,
                        wallet
                    );

                    const [
                        name,
                        symbol,
                        totalShares,
                        maxPerDeposit,
                        maxTotalDeposits,
                        currentTokenBalance,
                    ] = await Promise.all([
                        strategyContract.name().catch(() => "Unknown"),
                        strategyContract.symbol().catch(() => "Unknown"),
                        strategyContract.totalShares().catch(() => "Unknown"),
                        strategyContract
                            .maxPerDeposit()
                            .catch(() => ethers.MaxUint256),
                        strategyContract
                            .maxTotalDeposits()
                            .catch(() => ethers.MaxUint256),
                        strategyContract._tokenBalance().catch(() => BigInt(0)),
                    ]);

                    console.log("Strategy info:", {
                        address: NATIVE_STETH_STRATEGY,
                        name,
                        symbol,
                        totalShares: totalShares.toString(),
                        maxPerDeposit: ethers.formatEther(maxPerDeposit),
                        maxTotalDeposits: ethers.formatEther(maxTotalDeposits),
                        currentTokenBalance:
                            ethers.formatEther(currentTokenBalance),
                    });

                    // Check TVL limits using BigInt comparisons
                    if (BigInt(amount) > BigInt(maxPerDeposit)) {
                        console.error("Amount exceeds max per deposit limit", {
                            amount: ethers.formatEther(amount),
                            maxPerDeposit: ethers.formatEther(maxPerDeposit),
                        });
                        throw new Error("Amount exceeds max per deposit limit");
                    }

                    if (
                        BigInt(currentTokenBalance) + BigInt(amount) >
                        BigInt(maxTotalDeposits)
                    ) {
                        console.error(
                            "Amount would exceed max total deposits",
                            {
                                amount: ethers.formatEther(amount),
                                currentBalance:
                                    ethers.formatEther(currentTokenBalance),
                                maxTotalDeposits:
                                    ethers.formatEther(maxTotalDeposits),
                            }
                        );
                        throw new Error(
                            "Amount would exceed max total deposits"
                        );
                    }

                    // Try to estimate shares we would get
                    try {
                        const expectedShares =
                            await strategyContract.underlyingToSharesView(
                                amount
                            );
                        console.log(
                            "Expected shares:",
                            expectedShares.toString()
                        );
                    } catch (error) {
                        console.log(
                            "Could not estimate shares:",
                            error.message
                        );
                    }

                    // Transaction options
                    const overrides = {
                        gasLimit: 1000000, // Set an appropriate gas limit
                    };

                    // Simulate the transaction
                    console.log("Simulating transaction...");
                    const callStatic =
                        await strategyManager.depositIntoStrategy.staticCall(
                            NATIVE_STETH_STRATEGY,
                            STETH_TOKEN,
                            amount,
                            overrides
                        );
                    console.log("Simulation successful:", callStatic);

                    // Send the actual transaction
                    console.log("Sending transaction...");
                    const depositTx = await strategyManager.depositIntoStrategy(
                        NATIVE_STETH_STRATEGY,
                        STETH_TOKEN,
                        amount,
                        overrides
                    );

                    console.log("Transaction details:", {
                        hash: depositTx.hash,
                        data: depositTx.data,
                        to: depositTx.to,
                        from: depositTx.from,
                        gasLimit: depositTx.gasLimit?.toString(),
                    });

                    console.log("Transaction submitted:", depositTx.hash);
                    const receipt = await depositTx.wait();
                    console.log(
                        "Transaction confirmed in block:",
                        receipt.blockNumber
                    );

                    // Verify the deposit was successful
                    const newDeposits = await strategyManager.getDeposits(
                        wallet.address
                    );
                    console.log("New deposits:", newDeposits);

                    // Create success response
                    const response = {
                        hash: depositTx.hash,
                        from: wallet.address,
                        amount: ethers.formatEther(amount),
                    };

                    await runtime.messageManager.createMemory({
                        userId: message.userId,
                        roomId: message.roomId,
                        agentId: message.agentId,
                        content: {
                            text: `Successfully deposited ${response.amount} stETH into EigenLayer\nTransaction hash: ${response.hash}`,
                            action: "EIGEN_DEPOSIT",
                        },
                    });

                    return true;
                } catch (error) {
/*                     console.error("Detailed error:", {
                        message: error.message,
                        code: error.code,
                        data: error.data,
                        transaction: error.transaction,
                        stack: error.stack,
                        error: JSON.stringify(error, null, 2),
                    }); */

                    // Try to decode error if possible
                    if (error.data) {
                        try {
                            const iface = new ethers.Interface(
                                strategyManagerABI
                            );
                            const decodedError = iface.parseError(error.data);
                            console.log("Decoded error:", {
                                name: decodedError.name,
                                args: decodedError.args,
                            });
                        } catch (error) {
                            console.log("Could not decode error data", error);
                        }
                    }

                    return false;
                }
            } catch (error) {
/*                 console.error("Detailed error:", {
                    message: error.message,
                    code: error.code,
                    data: error.data,
                    transaction: error.transaction,
                    error: JSON.stringify(error, null, 2),
                }); */

                if (error.code === "ACTION_REJECTED") {
                    console.log("Transaction was rejected by user");
                } else if (error.code === "INSUFFICIENT_FUNDS") {
                    console.log("Insufficient funds for transaction");
                } else if (error.code === "CALL_EXCEPTION") {
                    console.log("Contract call reverted. Details:", {
                        to: error.transaction?.to,
                        data: error.transaction?.data,
                        from: error.transaction?.from,
                    });
                }

                return false;
            }
        } catch (error) {
/*             console.error("Detailed error:", {
                message: error.message,
                code: error.code,
                data: error.data,
                transaction: error.transaction,
                error: JSON.stringify(error, null, 2),
            });
 */
            if (error.code === "ACTION_REJECTED") {
                console.log("Transaction was rejected by user");
            } else if (error.code === "INSUFFICIENT_FUNDS") {
                console.log("Insufficient funds for transaction");
            } else if (error.code === "CALL_EXCEPTION") {
                console.log("Contract call reverted. Details:", {
                    to: error.transaction?.to,
                    data: error.transaction?.data,
                    from: error.transaction?.from,
                });
            }

            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Please deposit 0.1 ETH into EigenLayer",
                    amount: "0.1",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Processing your EigenLayer deposit.",
                    action: "EIGEN_DEPOSIT",
                },
            },
        ],
    ],
};

export default eigenDepositAction;
