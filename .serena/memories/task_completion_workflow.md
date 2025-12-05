# Task Completion Workflow

## When a Task is Completed

### Formatting and Linting
- Always attempt to fix linting errors automatically using the --fix option
- Always run the project formatter on code that you create or files that you modify
- Check package.json and/or vscode workspace settings to understand which tool to use
- Use Biome for linting and formatting: `pnpm lint:fix`

### Testing
- Run tests with `pnpm test` or `pnpm test:watch`
- Run a single test file: `pnpm test path/to/test.test.tsx`
- architect-vite uses jsdom environment with React Testing Library

### Important Notes
- Do not run linting or typechecking tasks unless specifically instructed to do so, as they may fail due to the current state of the codebase
- Prioritize completing modifications to a single file to avoid running out of context mid-way through complex tasks

### Type Checking
- Available via `pnpm typecheck` (app-specific) or `pnpm typecheck-all` (root level)
- Only run when explicitly requested by user