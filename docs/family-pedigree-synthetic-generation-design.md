# Redesigning synthetic data generation for FamilyPedigree

> **Status:** Design proposal for discussion.
>
> **Problem:** `generateNetwork` treats the FamilyPedigree stage's structural variables as ordinary
> attributes to fill randomly. The result is not a pedigree — it is a scatter of people with
> impossible sexes, many egos, no unions, and no parentage. It cannot be rendered by
> `NarrativePedigree` and could never have been produced by the interface it is meant to simulate.
>
> **Audience:** Network Canvas team.

---

## 1. What it produces today

Generated from the `eco-genetic-relationship-maps` template across five seeds:

| Seed | Nodes | Family edges | Partner edges | Edges with `gameteRole` | Nodes flagged ego | Multi-valued `biologicalSex` | Children with ≥2 parents |
| ---- | ----- | ------------ | ------------- | ----------------------- | ----------------- | ---------------------------- | ------------------------ |
| 1    | 14    | 5            | **0**         | **0**                   | **3**             | 7                            | **0**                    |
| 2    | 16    | 7            | **0**         | **0**                   | **6**             | 8                            | **0**                    |
| 3    | 12    | 3            | **0**         | **0**                   | **7**             | 6                            | **0**                    |
| 4    | 17    | 8            | **0**         | **0**                   | **3**             | 8                            | **0**                    |
| 5    | 12    | 3            | **0**         | **0**                   | **5**             | 6                            | **0**                    |

Every column in bold is a violation of the pedigree data model, and every one is systematic rather
than seed-specific.

### 1.1 Two distinct problems, not one

Splitting the same run by which stage created each node separates them cleanly:

| Origin stage                         | Nodes | `is_ego` true | Multi-valued `biologicalSex` |
| ------------------------------------ | ----- | ------------- | ---------------------------- |
| `family-pedigree` (FamilyPedigree)   | 8     | 1 ✓           | 4                            |
| `ng-non-kin` (NameGeneratorQuickAdd) | 8     | **7**         | 4                            |

**Problem A — the pedigree handler builds the wrong structure.** `handleFamilyPedigree`
(`stageHandlers.ts:646`) creates 4–10 nodes (`config.familyPedigreeNodeCount`) and joins them with
a **uniform random rooted tree**: each node after the first gets exactly one parent drawn from the
nodes before it. Consequences:

1. **No child ever has two parents**, and **ego is the tree root with zero parents**. The
   interface's hard floor — independent of `boundaries` — is that ego has ≥2 non-`partner`,
   non-`social` parent edges before it will finalize. The generated pedigree is upside-down
   relative to the model, where ego sits mid-tree with ancestors above.
2. **No partner edges at all**, so there are no unions to hang children from.
3. **No `gameteRole`, no `isGestationalCarrier`** — both deliberately left undefined today
   (`entityCounts.ts:610-615`). Transmission is therefore undefined.
4. **`relationshipType` is the literal `['biological']` on every edge** and `isActive: true` on all
   of them, where it is meaningless (it distinguishes current from past partnerships).
5. **`biologicalSex`, `relationshipVariable` and the label are not special-cased at all** — drawn
   as ordinary codebook variables, so kinship terms disagree with the graph.
6. **Stage metadata carries only `isNetworkCommitted`.** The runtime also writes `nodes`, `edges`,
   `selectedFraming` and `noChildrenAffirmed`. Without the `nodes` list, `pedigreeMemberIds()`
   returns `null` and `NarrativePedigree` falls back to _every_ node of the pedigree's type — so in
   this template the participant's friends and colleagues get swept onto the family tree.
7. **`nominationPrompts` are never read.** Their variables are filled as independent random
   booleans, so there is no inheritance pattern to visualise — the one thing `NarrativePedigree`
   exists to show.

**Problem B — generation does not respect interview linearity.** Seven of the eight nodes the _name
generator_ created carry `is_ego: true`. The cause is `nodes.ts:1025`:

```ts
const variableIds = Object.keys(nodeTypeDef.variables ?? {});
```

Node creation fills **every variable of the node type**, regardless of whether the creating stage
writes it. `is_ego` is simply the most visible casualty.

The correct principle, and the one that should govern generation generally: **a Network Canvas
interview is linear.** A stage writes only the variables it actually writes, to the entities it
actually reaches. Later stages may modify what earlier stages set — that is normal — but a name
generator that does not collect `is_ego` must not produce nodes carrying it. A synthetic network
should be reachable by walking the protocol in order, exactly as a participant would.

This is not an edge case for CEGRM-style designs. A pedigree overlaid with a wider personal network
_requires_ one shared node type so kin and non-kin appear on the same sociogram, so any protocol
doing that will hit it.

**The good news: most of the write-forward machinery already exists.** Auditing the handlers, the
stages that own a variable mostly already write it onto the nodes they reach:

| Stage                         | Writes its own variables forward?                 |
| ----------------------------- | ------------------------------------------------- |
| `OrdinalBin`/`CategoricalBin` | Yes — `assignBinValue` per prompt variable        |
| `Geospatial`                  | Yes — per prompt variable                         |
| `AlterForm`/`AlterEdgeForm`   | Yes — `only: formVarIds`                          |
| `Sociogram`                   | Layout only — **highlight variables not written** |
| `FamilyPedigree`              | **Nomination prompts not written**                |

So the change is three focused pieces, not a rewrite:

1. Narrow `createNodesForStage`'s `only` set from "every variable of the type" to "the variables
   this stage writes at creation" (its form fields / `quickAdd` / `additionalAttributes` / roster
   values).
2. Add highlight-variable write-forward to `handleSociogram`.
3. Add nomination-prompt write-forward to the pedigree handler (needed for Problem A regardless).

The blast radius is the honest risk: the generator's test suite pins current output extensively, and
"fill everything at creation" is baked into many assertions. Expect to revisit those deliberately —
each is a case where the old expectation encoded the bug.

Multi-valued `biologicalSex` (`["male","intersex"]`, `["female","male"]`) affects both origins
equally: the locked single-select categorical is being filled as a multi-select. The model stores a
single-element array, and `resolveSex` cannot interpret two values.

## 2. Why

A pedigree's variables are not attributes that happen to live on a person. They are a **tightly
constrained relational data model** in which `biologicalSex`, `gameteRole`, `relationshipType` and
the edge topology are mutually constraining: an egg contributor is female, a child has exactly one
egg and one sperm contributor, exactly one person is ego, and a condition's presence is determined
by descent rather than drawn independently.

The generic generator has no way to know any of that. Filling these slots at random is not a
degraded pedigree; it is a category error. This is why the objective of an **entirely separate
process** is the right one — the fix is not better heuristics inside the general filler.

A structural note the current code makes explicit: a genetically coherent pedigree must decide
**sex, generation and union before drawing parentage**, which is the inverse of the present draw
order. That ordering inversion is the core of the redesign.

## 3. Proposed design

### 3.1 Placement and seam

**The dispatch point itself is trivial.** `generateNetwork.ts:310` is a single
`case 'FamilyPedigree': handleFamilyPedigree(ctx, draft, stage, i)`, and the handler's contract is
just "mutate `draft.nodes` / `draft.edges` / `draft.stageMetadata[i]` in place". Swapping in a
purpose-built module under `generateNetwork/pedigree/` is mechanical.

**The real work is the feasibility layer.** Six satellite contracts encode today's structure as
arithmetic, and a redesign invalidates all of them. This is the part to budget for:

| Contract                                                                       | Where                          | Why it breaks                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pedigreeEdgeValues(edgeConfig)`                                               | `entityCounts.ts:617`          | Single source of truth shared by the writer, the value reservation and the feasibility count. Returns **one flat record for all edges**; a partner/parentage split makes it per-edge-kind, and every reader changes. |
| `pedigreeNodeCeiling` + the `FamilyPedigree` branch of `worstCaseEntityCounts` | `entityCounts.ts:572`, `:1019` | Hardcodes `edges = nodes - 1`. Two parents per child plus partner edges is roughly **2n**, so this becomes an undercount and `unique` variables exhaust mid-run.                                                     |
| `countPedigreeFixedValues`                                                     | `feasibility.ts:291`           | Counts ego `true`×1 / `false`×(ceiling−1) and each edge value × (ceiling−1).                                                                                                                                         |
| `reserveFamilyPedigreeFixedValues`                                             | `stageHandlers.ts:617`         | Reserves the proband's `true` and each edge value once for the whole run.                                                                                                                                            |
| `isUnwrittenPedigreeEdgeReference` / `edgeCountFor`                            | `entityCounts.ts:654`, `:115`  | Exempt `gameteRole` and `isGestationalCarrier` from rule analysis **because the generator never writes them**. Writing them narrows this carve-out.                                                                  |
| `ordinaryFormFields`                                                           | `composerRenderings.ts:169`    | Recovers the node type from `nodeConfig`, since FamilyPedigree has no `subject`.                                                                                                                                     |

The cleanest shape: have the new module **declare** its node and edge output bounds through
exported functions the feasibility layer imports, replacing the three hardcoded arithmetic sites
rather than duplicating new ones.

**Two soft contracts** to preserve: all randomness must come from `ctx.valueGen` (determinism —
`uuid()` is unseeded, so tests compare by position), and `draft.stageMetadata[i]` must parse
against `FamilyPedigreeStageMetadataSchema` or Architect's PreviewHost silently drops it.

**Fixing Problem B** needs one addition beyond the pedigree module: a set of **variables claimed by
a pedigree stage**, which the generic attribute filler must skip on _every_ node of that type, no
matter which stage created it. Without this, a CEGRM-style protocol keeps getting stray egos and
random sexes on its non-kin.

`protocol-utilities` cannot import from `packages/interview`, so the generator mirrors rather than
imports the runtime's `CommitBatch`/`VariableConfig` shapes (`FamilyPedigree/store.ts`). Both sides
already read the canonical option sets from `@codaco/shared-consts`.

> **Recommendation worth deciding separately:** the invariants in §3.7 are currently enforced only
> inside the runtime store, which _throws_ on violation, and **no existing test asserts anything
> about pedigree shape validity** — no ego parent count, no generational consistency, no partner
> edges. Lifting them into a shared `validatePedigreeStructure(...)` used by the store, the
> generator and its tests would have caught every defect in §1 automatically.

### 3.2 The other generation path

`SyntheticInterview` (used by Storybook and the interface e2e matrix) has its **own** `getNetwork()`
that reuses the constraint machinery but not the stage handlers — so it does not produce pedigree
structure at all. Everything good today is hand-authored: `comprehensivePedigreeFixture.ts` builds
its five-generation, 20-person pedigree entirely from `addManualNode`/`addManualEdge`, with two
parents per child, seven partner edges, ego mid-tree, per-person sex, and nomination booleans
**routed along inheritance paths**.

That fixture is the best statement of what "good" looks like, and it is 443 hand-maintained lines.
The redesign should aim to generate it — and then `comprehensivePedigreeFixture` becomes a
parameterised call rather than a file to keep in sync. Decide explicitly whether the new module
serves both paths; doing so is most of the value.

### 3.3 A four-stage pipeline

Structure first, biology second, phenotype third, serialisation last. Each stage is independently
testable and only the last knows about Network Canvas at all.

```
A. Kinship skeleton   → an abstract family: people, unions, sibships, generations
B. Parentage variants → adoption, donor gametes, surrogacy applied to specific births
C. Disease            → genotypes propagated by descent, phenotypes derived
D. Render             → nodes, edges, attributes, stage metadata
```

### 3.4 Stage A — the kinship skeleton

Build outward from ego over four generations (grandparents → parents → ego → children), sampling
sibships from a completed-fertility distribution and attaching a partner to each adult with some
probability.

**Two statistical corrections that make the difference between a plausible tree and a silly one.**
Both are easy to miss:

- **Zero-truncation.** When drawing the sibship of someone _known to be a parent_ — ego's mother,
  say — sample from the fertility distribution renormalised over 1…4+. Drawing from the raw
  distribution would make 19% of parents childless, which is a contradiction.
- **Size-biasing.** Ego is a _child_, so ego's own sibship is not a draw from the fertility
  distribution. The chance a randomly chosen child belongs to a sibship of size _k_ is proportional
  to _k·P(k)_. Ignoring this systematically under-produces large sibships, and since cousin counts
  scale roughly with the square of the reproductive rate, the error compounds badly at the cousin
  layer.

### 3.5 Population parameters

All rates are configurable; these are the proposed defaults, with sources. They are US/Northern
European and should be labelled as such rather than presented as universal.

| Parameter                                  | Default                                              | Source                                        |
| ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------- |
| Completed fertility (women 40–44, US 2022) | 0: 19%, 1: 19%, 2: 32%, 3: 20%, 4+: 11% (mean ≈ 1.9) | NCFMR/CPS                                     |
| Twin delivery                              | 3.1% of deliveries                                   | CDC/NCHS 2023 (30.7 per 1,000)                |
| First marriages ending in divorce          | ~40%                                                 | Pew Research                                  |
| New marriages forming a stepfamily         | ~1 in 3                                              | Stepfamily statistics                         |
| ≥1 living grandparent at age 30            | 75%                                                  | US cohort grandparenthood demography          |
| Adoption                                   | 2.5% of children under 18                            | US adoption survey                            |
| Donor egg                                  | ~0.27% of births (≈1 in 373)                         | CDC ART 2021                                  |
| Donor sperm                                | ~0.7% of women 15–44 ever used DI                    | NSFG 1995–2017 (lifetime-ever, not per birth) |
| Gestational carrier                        | 4.4% of ART cycles ≈ 0.1% of births                  | CDC ART 2021; ART ≈ 2.6% of US births         |

**Calibration targets** (what a correct generator should reproduce in aggregate, from the Swedish
full-population register study — the only empirical kinship enumeration of a complete population):

- ~20 living kin at age 35, falling to ~10 by age 70
- **~8 cousins on average** in the mid-30s, with ~30% having 11 or more
- horizontal kin (cousins) dominate the network

These belong in a statistical test that generates several thousand pedigrees and asserts the means
land in the right band — that is the real proof the demography works, and it is cheap to run.

### 3.6 The rare-events problem, and why two modes are needed

This is the design's sharpest tension and worth an explicit decision.

At true population rates, a 25-person pedigree contains an adoption roughly half the time, and a
donor-gamete or surrogacy arrangement **less than 5% of the time**. So a faithfully-calibrated
generator would almost never exercise the donor, surrogate, gestational-carrier or egg-donation
paths — exactly the paths most likely to harbour bugs, and the ones the interface went to
considerable trouble to support.

Proposed resolution — one generator, two modes:

- **`populationRates`** (default for anything claiming realism): sample at the rates above.
- **`showcase`** (default for Architect preview, Storybook, and interface tests): guarantee at
  least one of each supported arrangement, placed on genetically sensible branches. This is what
  `comprehensivePedigreeFixture.ts` already does by hand for the six inheritance patterns, and it
  is the right instinct — the proposal is to make it generated and parameterised rather than
  hand-maintained.

### 3.7 Invariants — the acceptance criteria

The generator must never emit a pedigree violating any of these, and each should be a test:

1. Exactly one node has the ego flag `true`.
2. Every `biologicalSex` is a **single**-element array drawn from the canonical option set.
3. Ego has ≥2 non-`partner`, non-`social` parent edges (the finalize floor); so does every
   non-founder.
4. Each child has exactly one egg contributor and one sperm contributor, and gamete-parent sex
   agrees with role (egg → female, sperm → male) as `deriveBiologicalSex` expects.
5. `gameteRole` is present on every `biological`/`donor` parent edge and absent on
   `surrogate`/`social`/`adoptive`.
6. `isGestationalCarrier` is true on exactly the carrying edge; where the egg parent also carried,
   the single egg edge is flagged rather than a second edge added.
7. No two edges of the same `relationshipType` between the same pair in either direction — the
   runtime store throws on this.
8. `isActive` appears only where meaningful (partner edges).
9. Stage metadata is complete: `isNetworkCommitted: true` plus the full `nodes` (each with
   `isEgo`) and `edges` lists, so `NarrativePedigree` scopes correctly and later-added alters of
   the same node type stay off the family tree.
10. Every generated pedigree passes the same completeness check the interface runs before finalize.

### 3.8 Stage C — disease, so there is something to visualise

Rather than flipping the nomination booleans independently:

1. Read the inheritance pattern from the `NarrativePedigree` stage whose `sourceStageId` points at
   this pedigree, so generated data matches what will actually be rendered. Fall back to autosomal
   dominant when no such stage exists.
2. Seed a founder genotype in one grandparental line.
3. Propagate genotypes by the real Mendelian rules for that pattern — the same four rules the
   interface documents: only `biological`/`donor` edges transmit, unknown sex stays uncertain,
   X-linked follows the maternal line, mitochondrial follows the egg.
4. Derive phenotype, and write the nomination boolean only where affected.

The payoff is that the closing pedigree view shows a coherent descent pathway rather than noise,
and that focal-person tracing highlights a genuinely correct contributor set. For `multifactorial`
and `unknown`, which infer nothing, independent sampling at a plausible prevalence remains correct.

## 4. Decisions

Three questions were open; all are now settled.

**1. Two modes, defaulting to `showcase`.** The mode is explicit config. `showcase` is the default
because every current consumer — Architect preview, Storybook, the conformance and feasibility
tests — wants coverage of the unusual arrangements more than distributional fidelity, and a
"realistic" default that exercises the donor and surrogacy paths under 5% of the time is a trap:
it looks principled while leaving the riskiest code untested.

The exception is generating a _corpus_. Fifty synthetic sessions that each contain an adoption, a
donor conception and a surrogacy are not realistic, they are absurd. So Interviewer's batch
generator passes `populationRates` explicitly. Rule of thumb: **`showcase` for one network you are
going to look at, `populationRates` for many you are going to count.**

**2. Lift the invariants into a shared validator.** `validatePedigreeStructure(...)` in
`shared-consts`, used by the runtime store, the generator, and both their test suites. This is the
highest-leverage item on the list. Today the invariants live only in the store, which throws at
runtime, and **no test asserts anything about pedigree shape** — not ego's parent count, not
generational consistency, not the presence of partner edges. Every defect in §1 would have been
caught at authoring time by a checker that existed in one place. It also stops the generator and
the runtime drifting, which is the failure mode that produced this situation.

**3. Serve `SyntheticInterview` too.** This is where most of the value is. `comprehensivePedigreeFixture.ts`
is 443 hand-maintained lines encoding six inheritance patterns, a consanguineous union and an
egg-donation branch — and it exists precisely because generation could not produce any of it. If
the new module generates that fixture, it stops being a file to keep in sync with the genetics
engine, and the `showcase` mode gets its acceptance test for free: _generate a pedigree that
exercises every notation symbol_, which is exactly what that fixture already asserts.

Two further points, not in question but worth recording:

- **Four generations** around ego (grandparents → parents → ego → children) covers everything the
  interface renders and every calibration target in §3.5. Great-grandparents add cost without
  exercising anything new.
- **The parameters are US/Northern European** and should ship as a named parameter set rather than
  baked-in constants, so another setting can substitute its own.

### Sequencing — revised after a spike

The plan was to do linearity (B) first as the smaller, independent change. **A spike showed that
is wrong, and the finding changes the shape of the work.**

The spike implemented all three pieces of §1.1: narrowed `createNodesForStage`'s `only` set to the
creating stage's writes, added Sociogram highlight write-forward, added the config knob. It is
about forty lines. The result:

```
Test Files  8 failed | 18 passed (26)
Tests      59 failed | 957 passed (1016)
```

The failures are **not** in the "a node no longer carries variable X" assertions that would be
mechanical to update. They cluster in `constraints/` and `feasibility.ts` — the up-front refusal
layer. That layer decides, before any drawing, whether a protocol can be generated at all, and its
arithmetic assumes **every variable of a node type is drawn on every node that type creates**.
Narrow what gets written and the `unique`-value accounting over-counts, rule analysis loses writers
it expected, and the generator starts refusing protocols it can generate perfectly well.

That is the same layer Problem A must rework — `worstCaseEntityCounts`, `countPedigreeFixedValues`,
`pedigreeEdgeValues` and the `isUnwrittenPedigreeEdgeReference` carve-out all encode "what gets
written, and how much of it". **So B does not avoid A's hardest part; it hits it first, from a
different direction.**

Revised plan — one change, not two, sequenced internally:

1. **Rework the feasibility layer's model of writes.** Replace the implicit "everything, always"
   assumption with an explicit per-stage write set that both the drawing code and the feasibility
   arithmetic consume. This is the load-bearing change and everything else is downstream of it.
2. **Linearity** falls out: creation-time writes narrow to the stage's own set, and the two missing
   write-forwards are added.
3. **The pedigree generator** then declares its own node and edge output bounds through the same
   mechanism, instead of the three hardcoded arithmetic sites.
4. **The shared validator**, which is independent and can land at any point.

The 59 failing tests are then triaged against the new model rather than against a spike — several
genuinely encode the old bug and should change; several encode real feasibility guarantees and
must keep passing. Relaxing an assertion to reach green would be the wrong move in every case.

The spike patch is kept at `linearity-spike.patch` in the session scratchpad; it is a useful
starting point but should not be applied as-is.

## 5. Sources

- Number of Children to Women Aged 40–44, 1980–2022. NCFMR (Bowling Green State University), FP-23-29.
- Kolk M, Andersson G, Pettersson E, Sjöberg M. _The Swedish Kinship Universe._ Demography. 2023;60(5):1359–85.
- CDC/NCHS. _Multiple Births_ (twin delivery rate, 2023).
- CDC. _Assisted Reproductive Technology National Summary_ (donor egg, gestational carrier, 2021).
- Sawyer G, et al. _Estimates of donated sperm use in the United States: NSFG 1995–2017._ Fertil Steril. 2019.
- Pew Research Center. _Facts about divorce, marriage and remarriage in the United States._ 2025.
- Margolis R, Verdery AM. _A Cohort Perspective on the Demography of Grandparenthood._ 2019.
