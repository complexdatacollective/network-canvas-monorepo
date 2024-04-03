# @codaco/protocol-validation

This npm package implements methods for validating Network Canvas protocol files against an appropriate JSON schema.

It exports three methods:

1. validateSchema - validates a schema against the JSON schema

```js
const { hasErrors, errors } = validateSchema(schemaJson);
```

2. validateLogic - validates the logic of the protocol to ensure there are no inconsistencies. This includes validations that cannot be implemented within the JSON schema.

```js
const { hasErrors, errors } = validateLogic(protocolJson);
```

3. validateProtocol - validates the protocol against the schema and logic.

```js
try {
  validateProtocol(protocolJson, schemaJson);
  // schema is valid
} catch (e) {
  if (e instanceof ValidationError) {
    // schema is invalid. e.schemaErrors and e.dataErrors contain the errors
  } else {
    // some other error happened during the process
  }
}
```

It also exports migration functionality for migrating protocols from one version to another.

```js
const migratedProtocol = migrateProtocol(8, protocolJson);
```
