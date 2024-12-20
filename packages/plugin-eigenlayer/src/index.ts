import type { Plugin } from "@ai16z/eliza";
import eigenCompleteWithdrawalAction from "./actions/eigencompletewithdrawal.js";
import eigenDepositAction from "./actions/eigendeposit.js";
import eigenQueueWithdrawalAction from "./actions/eigenqueuewithdrawal.js";
import { factEvaluator } from "./evaluators/fact.js";
import { goalEvaluator } from "./evaluators/goal.js";
import { boredomProvider } from "./providers/boredom.js";
import { factsProvider } from "./providers/facts.js";
import { operatorProvider } from './providers/operator.js';
import { stakerProvider } from './providers/staker.js';
import { timeProvider } from "./providers/time.js";
import { tvlProvider } from './providers/tvl.js';

export * as actions from "./actions/index.js";
export * as evaluators from "./evaluators/index.js";
export * as providers from "./providers/index.js";

console.log("Registering EigenLayer actions:", {
    deposit: eigenDepositAction.name,
    queueWithdrawal: eigenQueueWithdrawalAction.name,
    completeWithdrawal: eigenCompleteWithdrawalAction.name
});

export const eigenlayerPlugin: Plugin = {
    name: "eigenlayer",
    description: "Agent EigenLayer with basic actions and evaluators",
    actions: [
        eigenDepositAction,
        eigenQueueWithdrawalAction,
        eigenCompleteWithdrawalAction
    ],
    evaluators: [factEvaluator, goalEvaluator],
    providers: [
        boredomProvider,
        timeProvider,
        factsProvider,
        tvlProvider,
        operatorProvider,
        stakerProvider
    ],
};
