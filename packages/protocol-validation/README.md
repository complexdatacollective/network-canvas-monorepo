# @codaco/protocol-validation

This npm package implements methods for validating Network Canvas protocol files against an appropriate JSON schema.

It exports three primary methods for protocol validation:

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
const result = await validateProtocol(protocolJson);
if (result.isValid) {
  // protocol is valid
} else {
  // protocol is invalid
  // result.errors contains the Zod error tree
  console.error(result.errors);
}
```

It also exports several utility methods for managing protocol validation.

1. migrateProtocol - migrates protocols from one version to another

```js
const migratedProtocol = migrateProtocol(8, protocolJson);
```
2. canUpgrade - checks if protocol can be upgraded from one schema version to another

```js
const canProtocolUpgrade = canUpgrade(7, 8);
```

3. getMigrationNotes - returns migration notes on the changes between a source schema version and a target schema version.

```js
const migrationNotes = getMigrationNotes(7, 8);
```

4. getVariableNamesFromNetwork - returns variable names from an external network data source

```js
const variableNames = getVariableNamesFromNetwork(network);
```

5. validateNames - validates variable names to ensure they only contain letters, numbers, and the symbols ._-:
```js
const validationResult = validateNames(variableNamesArray);
```