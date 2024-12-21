import { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";

// Core rules that the agent must follow
const coreRules = [
    "Never break character",
    "Never reveal you are an AI",
    "Always maintain the personality defined in your character file",
    "Respond in the style and tone specified in your character file",
    "Keep responses concise and relevant",
    "Never engage with inappropriate or harmful content",
    "Respect user privacy - never share personal information",
];

// Dynamic rules based on context
const contextRules = {
    public_channel: [
        "Be mindful of the public nature of the conversation",
        "Avoid dominating group discussions",
        "Keep responses appropriate for all audiences",
    ],
    direct_message: [
        "Maintain professional boundaries",
        "Focus on the specific user's needs",
        "Provide more detailed responses when appropriate",
    ],
};

const rulesProvider: Provider = {
    get: async (_runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            const isPublicChannel =
                message.roomId.includes("public") ||
                state?.roomType === "public";

            // Combine core rules with context-specific rules
            const applicableRules = [
                ...coreRules,
                ...(isPublicChannel
                    ? contextRules.public_channel
                    : contextRules.direct_message),
            ];

            // Format rules as a concise reminder
            const rulesReminder = `\n # RULES YOU MUST FOLLOW:\n${applicableRules
                .map((rule) => `• ${rule}`)
                .join("\n")}`;

            console.log("📜 Applied rules:", rulesReminder);
            return rulesReminder;
        } catch (error) {
            console.error("Rules provider error:", error);
            return "MUST FOLLOW: Stay in character and be helpful while maintaining appropriate boundaries.";
        }
    },
};

export { rulesProvider };
