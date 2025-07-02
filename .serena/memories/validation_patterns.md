# Validation Patterns in Network Canvas

## validateProtocol Function

Located in `packages/protocol-validation/src/index.ts`

### Function Signature
```typescript
export const validateProtocol = async (protocol: Protocol, forceSchemaVersion?: number) => {
  // Returns ValidationResult
}
```

### ValidationResult Type
```typescript
type ValidationResult = {
  isValid: boolean;
  schemaErrors: ValidationError[];
  logicErrors: ValidationError[];
  schemaVersion: number;
  schemaForced: boolean;
};
```

### Usage Patterns
- Always async function that returns a Promise<ValidationResult>
- Used in architect app during protocol save operations
- Can optionally force a specific schema version
- Validates both schema structure and business logic
- Throws errors for undefined protocols or internal validation errors

### Current Usage in Architect
- Called in `saveNetcanvas` action in `apps/architect-vite/src/ducks/modules/userActions/webUserActions.ts`
- Used with try/catch to handle validation errors
- Shows validation error dialog on failure
- Currently synchronous call in save operation (may benefit from async state management)

### Alternative Function
- `validateProtocolZod` - zod-only validation version available in same package