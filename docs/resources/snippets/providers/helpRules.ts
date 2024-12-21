import {
    composeContext,
    generateTrueOrFalse,
    IAgentRuntime,
    Memory,
    ModelClass,
    Provider,
    State,
} from "@ai16z/eliza";

const shouldShowHelpTemplate =
    `# Task: Determine if the user is requesting help or information about capabilities

Look for:
- Direct help requests ("/help", "help me", etc.)
- Questions about capabilities
- Asking what the bot can do
- Confusion about how to use features
- Telegram commands like /help, /start, /commands
- Questions about available commands

Based on the last message, is this a help request? YES or NO

Last Message:
{{lastMessage}}

Should I show help information? ` + "YES or NO";

const helpRulesProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            // Check for Telegram commands first
            const text = message.content.text?.toLowerCase();
            if (text?.startsWith("/help") || text?.startsWith("/start")) {
                return getHelpRules();
            }

            // Get last message for intent check
            const lastMessage =
                state?.recentMessagesData?.[
                    state.recentMessagesData.length - 1
                ];
            const contextState = lastMessage
                ? {
                      ...state,
                      lastMessage: lastMessage.content.text,
                      recentMessagesData: [lastMessage],
                  }
                : state;

            // Check if this is a help request
            const shouldShowContext = composeContext({
                state: contextState,
                template: shouldShowHelpTemplate,
            });

            const shouldShowHelp = await generateTrueOrFalse({
                context: shouldShowContext,
                modelClass: ModelClass.SMALL,
                runtime,
            });

            if (!shouldShowHelp) {
                return ""; // Skip if not requesting help
            }

            return getHelpRules();
        } catch (error) {
            console.error("Help rules provider error:", error);
            return "";
        }
    },
};

function getHelpRules(): string {
    return `
# RULES YOU MUST FOLLOW FOR HELP REQUESTS:

• Provide a clear and structured overview of your capabilities
• Explain how to interact with you naturally
• Keep explanations concise but informative
• Use bullet points for better readability
• Include examples of how to ask for specific analyses
• Mention any limitations or requirements
• Be encouraging and welcoming in tones`;
}

export { helpRulesProvider };
