### Task 10 Report: Architect — remove NarrativePedigree presets/behaviours editors

**Status:** DONE
**Commit:** `9e9d0bbb0`

---

#### Files Deleted

- `apps/architect-web/src/components/sections/NarrativePedigree/Presets.tsx`
- `apps/architect-web/src/components/sections/NarrativePedigree/PresetFields.tsx`
- `apps/architect-web/src/components/sections/NarrativePedigree/Behaviours.tsx`
- `apps/architect-web/src/components/sections/NarrativePedigree/__tests__/Behaviours.test.tsx`
- `apps/architect-web/src/components/sections/NarrativePedigree/__tests__/PresetFields.test.tsx`

No co-located test for `Presets.tsx` existed.

---

#### FOCAL_POSITIONS Grep Result — Last Consumer Confirmed

All matches found by `grep -rn "FOCAL_POSITIONS|FocalPosition"`:

```
packages/shared-consts/src/narrative-pedigree.ts                                       — definition (removed)
packages/shared-consts/src/__tests__/narrative-pedigree.test.ts                        — test (updated)
apps/architect-web/.../NarrativePedigree/PresetFields.tsx                              — DELETED
apps/architect-web/.../NarrativePedigree/__tests__/PresetFields.test.tsx               — DELETED
```

`PresetFields.tsx` was the last app-level consumer. `FOCAL_POSITIONS` and `FocalPosition`
were safely removed from `packages/shared-consts/src/narrative-pedigree.ts`. The shared-consts
test was updated to remove the now-dead `FOCAL_POSITIONS` assertion.

---

#### Interfaces.tsx Edits

In `apps/architect-web/src/components/StageEditor/Interfaces.tsx`:

- Removed imports: `Behaviours` and `Presets` (from `~/components/sections/NarrativePedigree/...`)
- `INTERFACE_CONFIGS.NarrativePedigree.sections`:
  - Before: `[SourceStage, Diseases, Presets, Behaviours, SkipLogic, InterviewScript]`
  - After: `[SourceStage, Diseases, SkipLogic, InterviewScript]`
- `INTERFACE_CONFIGS.NarrativePedigree.template`:
  - Before: `{ sourceStageId: '', diseases: [], presets: [], behaviours: { allowFocalReselection: false } }`
  - After: `{ sourceStageId: '', diseases: [] }`

---

#### ProtocolSummary/Stage.tsx Verdict

No change required. The file extracts `configuration.presets` as `... | undefined` and passes
`presets ?? null` to `<Presets>`. Since NarrativePedigree no longer includes `presets` in its
data, this evaluates to `undefined` → `null` → renders nothing. Generic and optional — also
used by the Narrative interface which still has presets. No NP-specific breakage.

---

#### Test Command and Output

```
pnpm --filter @codaco/architect-web exec vitest run \
  "src/components/sections/NarrativePedigree/__tests__" \
  "src/components/StageEditor/__tests__"

Test Files  3 passed (3)
Tests       18 passed (18)
Duration    1.52s

pnpm --filter @codaco/shared-consts exec vitest run \
  "src/__tests__/narrative-pedigree.test.ts"

Test Files  1 passed (1)
Tests       1 passed (1)
Duration    102ms
```

---

#### Concerns

None. All deletions confirmed as last-consumers before removal. Pre-commit hook
(oxlint + oxfmt) ran clean on the staged files.
