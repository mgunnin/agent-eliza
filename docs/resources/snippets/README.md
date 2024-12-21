# Eliza Snippets

A collection of useful code snippets and examples for the [Eliza](https://github.com/ai16z/eliza) autonomous agent framework.

## Snippets

### 1. Rules Provider (`providers/rules.ts`)

A provider implementation that manages behavioral rules and constraints for Eliza agents. This provider ensures agents maintain consistent behavior and adhere to defined guidelines.

#### Features:

- Core rules enforcement for maintaining character and appropriate behavior
- Context-aware rules that adapt based on conversation settings (public/private)
- Dynamic rule application based on runtime context
- Built-in safety and privacy considerations

### 2. Help Rules Provider (`providers/helpRules.ts`)

A specialized provider that intelligently detects help requests and provides appropriate guidance rules for the agent. This provider helps manage how agents respond to user questions about capabilities and commands.

#### Features:

- Automatic detection of help requests through:
  - Direct commands (/help, /start)
  - Natural language help requests
  - Questions about capabilities
  - User confusion indicators
- Context-aware help response rules
- Integration with Telegram commands
- Structured help information delivery
