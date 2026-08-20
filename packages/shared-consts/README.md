# `@codaco/shared-consts`

Shared constants, runtime schemas, and TypeScript types used across Network
Canvas.

## Sparse entity attributes

`NcEntity`, `NcNode`, `NcEdge`, `NcEgo`, and `NcNetwork` expose a strict output
contract: every own property in an entity's `attributes` record contains a
defined `VariableValue`. A missing property is the only representation of an
unset variable.

`VariableValueSchema` and `VariableValue` support strings, booleans, numbers,
arrays of primitive values, encrypted number arrays, and `{ x, y }` layout
coordinates. They do not accept `null` or `undefined`. Defined empty values are
data, not absence, so writers and normalizers must preserve all of these:

```ts
{
  optedIn: false,
  count: 0,
  note: '',
  selections: [],
}
```

Do not create placeholder properties for unanswered variables:

```ts
// Correct: `nickname` is unset.
const attributes = {};

// Incorrect output: nullish values are not VariableValue values.
const attributes = { nickname: null };
```

## Input compatibility and strict output

Use `NcNetworkSchema.parse(input)` at persistence, synchronization, and other
untrusted-data boundaries. Its input accepts `null` and `undefined` attribute
entries, then omits those properties from every ego, node, and edge attribute
record. It preserves `false`, `0`, `''`, `[]`, and defined attributes not
declared by the current codebook.

The distinction between input and output is intentional:

```ts
const network: NcNetwork = NcNetworkSchema.parse(storedValue);
// network attributes are now Record<string, VariableValue>
```

Code that already has an `NcNetwork` must not write nullish values. Code that
accepts stored or external data must parse it before exposing the public output
types. `StageMetadataSchema` applies the same sparse normalization to Family
Pedigree edge attribute snapshots.
