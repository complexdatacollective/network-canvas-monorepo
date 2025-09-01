# Task Completion Checklist

## When a task is completed, ensure:

### Code Quality
1. **Run formatting and linting**: `pnpm format-and-lint:fix`
2. **Type checking**: Ensure no TypeScript errors
3. **Tests pass**: Run `pnpm test` to ensure all tests pass
4. **No `any` types**: Verify no TypeScript `any` types were introduced

### Testing Requirements
1. **Test coverage**: Ensure new code has comprehensive test coverage
2. **Edge cases**: Test boundary conditions and error scenarios
3. **Test descriptions**: Clear, descriptive test names
4. **Test isolation**: Tests should run independently

### File Management
1. **Prefer editing**: Always prefer editing existing files over creating new ones
2. **No unnecessary files**: Don't create documentation files unless explicitly requested
3. **Absolute paths**: When returning file paths in responses, use absolute paths

### Validation Specific
1. **Schema validation**: Ensure Zod schemas properly validate expected inputs
2. **superRefine logic**: Complex validation logic should be thoroughly tested
3. **Error messages**: Validation errors should be clear and actionable
4. **Helper functions**: Validation helpers should be tested independently

### Final Checks
1. **Build succeeds**: `pnpm build` completes successfully
2. **All tests pass**: No failing tests
3. **Linting passes**: No linting or formatting issues
4. **Type safety**: Full TypeScript compliance