# Client Configuration Guide

## Required Files and Structure

### agent/package.json

- Must include client in workspace configuration
- Essential for proper workspace integration

### index.ts

- Must include client addition/configuration
- Required for client initialization
- Example structure:

  ```typescript
  import { Client } from './client'
  // Add client to your configuration
  export const client = new Client()
  ```

### character.json

- Handles base configuration settings
- Used for primary character settings

## Plugin Management

### NPM Dependencies

- Each plugin maintains its own npm dependencies
- Dependencies are built and managed through pnpm
- Prevents need for building every plugin individually

### Configuration Structure

- Plugin-specific configurations cannot use character.json format
- Each plugin requires its own dependency set
- Dependencies must be pre-built and ready for use

### Setup Requirements

Use pnpm for dependency management

- Helps manage complex dependency structures
- Maintains consistent plugin builds

Ensure client is properly included in:

- agent/package.json (workspace)
- index.ts (initialization)

## File Checklist

- [ ] agent/package.json (with client workspace)
- [ ] index.ts (with client initialization)
- [ ] Plugin-specific dependency files
- [ ] pnpm configuration
