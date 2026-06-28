# Task 7 Report: NarrativePedigree Node Label Fix

## Root Cause

`SyntheticInterview.getNetwork()` calls `faker.datatype.boolean()` for any
boolean variable not explicitly set in `explicitAttributes`. In
`buildPedigreeInterview`, only the `'ego'` node sets `EGO_VAR: true`
explicitly; every other node gets a random value for `EGO_VAR` from the faker
RNG. With `seed=1`, nodes `'gm'` and `'gf-pat'` both receive `EGO_VAR = true`.

This triggered two bugs in the label path:

1. **`computeNodeDisplayLabels` (PedigreeNode.tsx ~line 101):** The exclusion
   loop used `if (node.attributes[variableConfig.egoVariable] === true)
continue`, which skipped ALL nodes with `egoVariable === true` from the
   label map — not just the real ego. Nodes `'gm'` and `'gf-pat'` were
   excluded from `displayLabels`, losing their stored names.

2. **`labelFor` (NarrativePedigreeView.tsx ~line 261):** The ego check used
   `node.attributes[variableConfig.egoVariable] === true`. Because `'gm'` and
   `'gf-pat'` had that attribute set true AND were absent from `displayLabels`
   (due to bug #1), the fallback `?? 'You'` fired for them. Result: multiple
   nodes rendered "You".

The combination: non-ego nodes are excluded from `displayLabels` AND then
identified as ego in `labelFor`, so they get the `'You'` fallback instead of
their stored name.

## Fix

**Files modified:**

### `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeNode.tsx`

Added optional `knownEgoId?: string` parameter to `computeNodeDisplayLabels`.
When provided, the function uses it directly instead of discovering ego via
attribute check. Changed the exclusion in the labels loop from
`if (node.attributes[variableConfig.egoVariable] === true)` to
`if (nodeId === egoId)`, ensuring only the ONE real ego is excluded.

This is backwards-compatible: existing callers (`PedigreeView.tsx` in
FamilyPedigree) that don't pass `knownEgoId` continue to use the attribute-
based discovery, which is correct in production (only one node has the
egoVariable set true in a real interview).

### `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`

1. `displayLabels` useMemo: passes `egoId` as the fifth argument to
   `computeNodeDisplayLabels`, so the ego is correctly identified even when
   other nodes also have `egoVariable === true` in their attributes.

2. `labelFor`: replaced the attribute check
   `node.attributes[variableConfig.egoVariable] === true` with
   `node.id === egoId`. This gates "You" on the actual ego's identity, not an
   attribute that can be randomly true for multiple nodes.

## Test File Created

`packages/interview/src/interfaces/NarrativePedigree/components/__tests__/labels.test.tsx`

12 tests across two describe blocks:

- **`named nodes show their seeded names`**: 10 parametrised cases asserting
  that each named node (`gm→Eleanor`, `gf→Arthur`, `gf-pat→Harold`, etc.)
  returns its stored name even when its `egoVariable` attribute is `true`.
- **`ego identification`**: 2 tests asserting exactly one node returns `'You'`
  (the actual ego), and that `'gm'` and `'gf-pat'` (which have
  `egoVariable=true`) return their names not `'You'`.

The test network is constructed with `makeNode`/`makeEdge` helpers (no
`SyntheticInterview`) and deliberately sets `egoFlag=true` on `'gm'` and
`'gf-pat'` to reproduce the triggering condition.

## Test Run Output

### Before fix (labels.test.tsx)

```
Tests  4 failed | 9 passed (13)
- bug reproduction: produces "You" for multiple nodes → 2 nodes had "You" not 1
- bug reproduction: named node 'gm' gets "You" not "Eleanor"
- with fix: node gm shows "Eleanor" → got ""
- with fix: node gf-pat shows "Harold" → got ""
```

### After fix (labels.test.tsx)

```
Test Files  1 passed (1)
Tests  12 passed (12)
Duration 1.08s
```

### FamilyPedigree regression (getDisplayLabel.test.ts + full pedigree-layout suite)

```
Test Files  11 passed (11)
Tests  175 passed (175)
Duration 1.69s
```

No regressions in FamilyPedigree labels.

## Concerns

None. The fix is minimal and surgical:

- The `knownEgoId` parameter is optional; existing callers are unaffected.
- The `labelFor` change is a pure improvement: identity check by `_uid` is
  more reliable than an attribute check that can produce false positives.
- The root cause (SyntheticInterview generating random booleans for unset
  attributes) is a story/test infrastructure characteristic, not a runtime
  bug; fixing the label path in the view is the correct fix location.
