# Family Pedigree — Consanguineous Unions (partnerships with existing relatives) and their children

**Date:** 2026-06-27
**Packages:** `@codaco/interview` (FamilyPedigree + NarrativePedigree)
**Status:** Design approved; genetics changes carry a research-team sign-off gate (see §6)

This is a follow-on to the family-pedigree redesign (PR #713). It adds the ability to
form a **partnership between two people who already exist in the pedigree**, so
**consanguineous unions** (e.g. ego partnered with a first cousin) and **their
children** can be captured, drawn, and analysed correctly.

## Problem

The Family Pedigree "Add partner" flow always **creates a brand-new person**
(`PedigreeView.handlePartner` → `addNode`). There is no way to link a partner to
someone already in the pedigree, so a participant cannot record that they are
partnered with their own cousin (or any existing relative), and the offspring of
such a union cannot be attributed to both biological parents. The whole class of
**consanguineous unions** — and the elevated recessive risk they carry — is
therefore uncapturable.

A standards/literature review (clinical-genetics nomenclature; pedigree interchange
formats; participant-facing tools — see §8) is unambiguous: the foundational
capability a pedigree instrument needs is to **connect two existing individuals as
partners**, forming a closed _mating loop_. "Mint a fresh person per partner" — our
current behaviour — is named as the single most-cited UX failure in family-history
tools (Welch et al. 2013) and the antipattern that destroys the loop and makes the
inbreeding coefficient uncomputable. Clinical pedigree editors (PhenoTips,
open-pedigree) all support linking the partner to an existing node.

## Guiding principle

**Consanguinity is derived from structure, not stored.** No established pedigree
format (LINKAGE/`.ped`, PLINK `.fam`, GEDCOM, BOADICEA/CanRisk) stores a
"consanguinity" field — the mating loop is implicit in shared-ancestor identity, and
the inbreeding coefficient is computed from it. Our interview network is already a
single shared graph with edges keyed by `{from, to, type}`, so a partner edge between
ego and a cousin is _just another edge_. Consequently:

- **No data-model change.** No new "consanguinity" or "degree" field. The fix is
  (a) letting the partner be an existing node, (b) **never** duplicating that node,
  and (c) exercising/correcting the analysis and rendering that already key off the
  loop structure.
- Most of the hard machinery already exists and is **dormant** because no union can
  be created today (see §3, §4). The work is concentrated in **capture** plus a
  **bounded, adversarially-verified genetics correction**.

A deliberate scope boundary: this feature changes a _categorical_ genetic call **only
at the recessive-homozygosity boundary**. Autosomal dominant, X-linked dominant,
Y-linked, mitochondrial, and multifactorial inheritance do **not** change under
consanguinity and are explicitly left alone (§4, §7).

---

## §1 — Capture: partner with an existing relative

### 1.1 Add-partner wizard extension

Extend the existing "Add partner" flow (node context-menu action `partner`,
currently handled in `PedigreeView.handlePartner`) with a first selector that mirrors
the **existing BioTriad "existing-or-new" pattern** (egg-source/sperm-source already
offer "pick an existing person OR create a new person"):

- A **non-judgmental screening prompt** — _"Is this person already in your family
  tree / related to you?"_ — with two branches:
  - **Pick existing** → choose from a candidate list (§1.2).
  - **Add new** → today's create-a-new-person flow, unchanged.
- The screening prompt is the **elicitation aid** the literature treats as
  essential: consanguinity is missed in the large majority of cases when not asked
  directly (Bishop/Saxby et al. 2008 — only 6.4% of midwives asked). It is asked of
  **everyone**, phrased matter-of-factly, and **not** triggered by ethnicity
  (UK Delphi consensus on non-stigmatising framing; consanguineous marriage is
  normative for ~1 billion people).

### 1.2 Candidate list — `partnerCandidates()`

A new pure selector alongside the existing `geneticParentCandidates` /
`socialParentCandidates` in `components/wizards/parentCandidates.ts`:

> **`partnerCandidates(anchorId, edges, variableConfig)`** = every existing person
> **except** `anchorId` itself, its **parents**, its **children**, and its **full
> siblings** (first-degree relatives excluded).

This covers every genetically-common consanguineous union — first/second cousins,
double first cousins, half-siblings, uncle/aunt–niece/nephew — while keeping
distressing parent/child/full-sib options out of a participant-facing picker.
(First-degree incest is representable in pedigree standards but deliberately
out of this picker's scope; see §7.) Already-current partners are not hard-excluded
(multiple matings are valid), and the store de-dups identical edges so re-selection
is idempotent.

### 1.3 Edge wiring

- **Existing person chosen:** create **only** the partner edge
  `{from: anchorId, to: existingId, [relationshipTypeVariable]: ['partner'],
[isActiveVariable]: current/ex}`. **Never call `addNode`.** Duplicating the partner
  is the antipattern that severs the loop and makes the inbreeding coefficient
  uncomputable — the whole point is that the _same_ node is reachable as both a
  relative and a partner.
- **New person:** unchanged (`addNode` + partner edge, as today).
- **No data-model change.**

---

## §2 — Children of the union

Largely free. Once ego is partnered with the cousin,
`geneticParentCandidates(ego, 'child')` **already includes ego's partners**, so the
existing-relative partner is automatically offered as the co-parent in the Add-child
wizard's BioTriad step, and the shared child links **both** biological parents —
closing the loop through the next generation (which is exactly what lets the genetics
layer reach the child via both arms).

Scope: **verify** this works end-to-end and that the child's parentage is correct.
No new flow.

---

## §3 — Rendering the consanguineous union (exercise the dormant layout)

The Sugiyama pedigree layout **already implements consanguinity drawing** — it is
simply never reached because no union can be created:

- `sugiyamaLayout.ts` detects consanguinity structurally ("do they share common
  ancestors?" — ancestor-set intersection of the two partners) and marks the partner
  group `2` (consanguineous) vs `1`.
- `connectors.ts` turns group `=== 2` into the **NSGC double horizontal relationship
  line** (`double` + `doubleSegment`), the clinical-standard consanguinity symbol.
- `DuplicateArc` machinery (the `.5`-encoded "married-in" nodes drawn in two places,
  connected by an arc) is the standard technique for loops.

Because these paths have **never executed**, treat them as likely to harbour latent
bugs (this session already hit several crashes in equivalently-dormant pedigree paths).

**Work:**

- Add a **representation story** (pre-seeded: ego ⚭ first cousin with a shared child)
  and a **creation-via-wizard story**; drive both and fix whatever breaks in the
  consanguinity detection, double-line rendering, duplicate-arc/loop layout.
- Confirm the **NSGC double line** renders for the union, and (where the relationship
  degree is not obvious from the layout) label it per the nomenclature.
- Unit-test the connector layer: a consanguineous union emits a `double` parent-group
  connector; a non-consanguineous one does not.

---

## §4 — Genetics: make the engine consanguinity-_correct_

The NarrativePedigree Mendelian engine is currently consanguinity-**safe** (a
visited-set terminates loops) but not consanguinity-**correct**. This section is the
output of an adversarial builder↔skeptic research workflow (converged after 2 rounds;
sources in §8). **Categorical status taxonomy** (per node, per disease; there is
deliberately **no** `unaffected` — absence ⇒ `unknown`):
`affected · obligateAffected · obligateCarrier · atRiskAffected · atRiskCarrier ·
unknown`.

### 4.1 The single real gap — recessive autozygosity

The **child of two carrier cousins can be homozygous-affected by autozygosity**
(homozygous-by-descent for one ancestral allele; F = 1/16 for first cousins),
**even though neither parent is affected**. That child warrants an
**at-risk-of-being-affected** signal (`atRiskAffected`-level risk — possible, not
certain; **never** `obligateAffected`, which is reserved for a child both of whose
parents are _nominated_ affected). How that signal is carried without being masked is
§4.2. Today the engine leaves that child **`unknown`** — a genuine under-call.

The same shape arises for **X-linked recessive**: a daughter of an affected father +
a carrier mother is ~50% homozygous-affected, but the engine stops at
`obligateCarrier`. This is a pre-existing under-call, structurally identical to the
AR case.

**The elevating predicate is two-sided and allele-conditioned, NOT
consanguinity-detection-conditioned.** It must fire when a child has **≥2 distinct
parents each `atRiskCarrier`-or-higher for the same disease** — which _also_ correctly
covers **compound heterozygosity** from two _unrelated_ carrier lines (also
potentially homozygous-affected). **Hard constraint:** the predicate must **not** gate
on graph ancestor-intersection / loop detection — doing so would wrongly drop the
unrelated-carrier-lines case. With **no segregating allele**, consanguinity alone
elevates **nothing** (the 2–4% population-level excess is non-categorical → the child
stays `unknown`). **One-sided** carrier risk never elevates (homozygosity needs the
allele from both sides).

### 4.2 Taxonomy change — a non-lattice "at-risk homozygous/affected" flag

The fix cannot simply assign `atRiskAffected`, because the status precedence lattice
ranks **`obligateCarrier` (index 2) _above_ `atRiskAffected` (index 3)** — the order
is **certainty**, not severity. So writing `atRiskAffected` onto a child who is
_also_ independently an `obligateCarrier` (reachable once arbitrary partnerships
exist) is **silently masked** by `mergeStatus`, losing the affected-axis risk. This
is the single soundness issue blocking **both** the AR and the XLR fixes — they are
**one decision**.

**Resolution (the approved approach):** keep the primary status + its certainty
lattice unchanged, and add a **separate, non-lattice dimension** — an
`atRiskHomozygous` flag per `(node, disease)` — merged by monotone **OR**,
independent of the primary-status precedence. A node can therefore be
`obligateCarrier` (primary) **and** carry `atRiskHomozygous` simultaneously, with no
masking and no loss of certainty/monotonicity.

- **Engine:** the result becomes `{ status, atRiskHomozygous }` per `(node, disease)`
  (or a parallel flag map). The flag is set by the two rules below; the primary status
  continues to merge by the existing lattice.
- **UI:** `StickerNode` / `ClassicNotationNode` surface the flag as an additional
  indicator (distinct from the primary status), so a person shown as a certain carrier
  who is _also_ at risk of being affected reads correctly. **The UI copy must not
  present this as reassurance** (consistent with the existing mito/at-risk gate note).

### 4.3 Rules (verified)

| Pattern                              | Scenario                                                                                                                                    | Correct call                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AR                                   | Child with **≥2 distinct parents each `atRiskCarrier`+** for the same disease (autozygous cousin-union child **or** unrelated compound-het) | set **`atRiskHomozygous`** flag on the child (primary status unchanged)                                |
| AR                                   | Consanguineous union, **no** segregating allele anywhere                                                                                    | **nothing** — all nodes `unknown`                                                                      |
| AR                                   | Only **one** parent at-risk/carrier                                                                                                         | child **not** flagged (existing one-sided behaviour)                                                   |
| XLR                                  | Daughter of **affected father + carrier mother** (same disease)                                                                             | keep **`obligateCarrier`** **+** set **`atRiskHomozygous`** flag                                       |
| XLR                                  | Affected father + **unrelated non-carrier** mother                                                                                          | `obligateCarrier` only (unchanged)                                                                     |
| AD / XLD / Y / mito / multifactorial | any consanguineous union                                                                                                                    | **unchanged** — no consanguinity logic (no second independent allele path; over-engineering otherwise) |

Cousin-union _ancestors_ are unchanged: an `affected` shared great-grandparent →
its children `obligateCarrier` → the cousins `atRiskCarrier` (a carrier ancestor
forces nothing downstream → never `obligateCarrier`). Only the **child of the loop**
gains the new flag.

### 4.4 Shippable hardening — edge de-duplication

Independent of the gated elevation, allowing partnerships between existing members
makes **duplicate/colliding edges** reachable. De-duplicate parent/child edges **at
ingestion** in `buildGeneticGraph` (track `parentId>childId` keys; skip dupes) so
every count predicate (`bothParentsAffected`, `carrierParentCount`, and the new
two-sided elevation) counts **distinct individuals**. Without this, a duplicated
biological edge could spuriously make `bothParentsAffected` true from a single
affected parent (→ spurious `obligateAffected`) or inflate the carrier-parent count.
This is correct and necessary on its own.

### 4.5 Invariants

- **Path-independence:** per-node status is a function of the pedigree, not of
  traversal order.
- **Monotone upgrade-only:** a second arm can only raise certainty, never lower it.
  The `atRiskHomozygous` flag is monotone-OR and never masked.
- **Distinct-individual counting:** a duplicated edge never inflates a count
  (enforced by §4.4).
- **Termination:** propagation terminates on cyclic/consanguineous pedigrees via the
  visited-set; the flag pass iterates node ids once.
- **Allele-specific:** every rule runs per disease variable; a shared ancestor
  carrying disease X never affects disease Y.
- **Two-sided:** AR elevation requires both parents `atRiskCarrier`+ for the **same**
  disease; one-sided never elevates; predicate is carrier-status-based, **not**
  ancestor-intersection.
- **No invented status / no spurious obligate:** never assign `unaffected`; a mating
  loop never manufactures `obligate*` from topology alone; the autozygosity case is
  `atRiskHomozygous`, never `obligateAffected`.
- **Idempotence:** one ancestral allele reaching a node by multiple paths, or two
  shared ancestors, yields the same result (no escalation).
- **Certainty-preservation:** a certain status (e.g. XLR `obligateCarrier` via the
  paternal X) is never discarded to assert a less-certain possibility — the flag
  carries the affected-axis risk alongside it.

### 4.6 Tests

- **Ship now:** edge de-dup (single affected parent via a duplicated edge → child
  `obligateCarrier`, **not** `obligateAffected`; `parentsOf` returns one entry);
  no-segregating-allele loop (empty `affected` → all `unknown`); AD consanguinity
  no-op (child identical to non-consanguineous baseline); one-sided guard (child not
  flagged); cousin-union both-arms statuses that hold today (GGP `affected`, parents
  `obligateCarrier`, cousins `atRiskCarrier`).
- **Elevation (lands with §4.2):** autozygous cousin-union child → `atRiskHomozygous`;
  unrelated compound-het child → `atRiskHomozygous` (proves no ancestor-intersection
  gating); double-shared-ancestor idempotence; XLR daughter → `obligateCarrier` +
  `atRiskHomozygous`; XLR unrelated-mother control unchanged.
- **Rendering:** consanguineous union emits a `double` connector; representation
  story renders without error.

---

## §5 — Components & files

- `components/wizards/parentCandidates.ts` — new `partnerCandidates()`.
- `pedigree-layout/components/PedigreeView.tsx` (`handlePartner`) + the partner
  wizard/form (`components/AddPersonForm.tsx`) — existing-or-new selector +
  screening prompt + link-existing edge wiring (no `addNode`).
- `genetics/geneticGraph.ts` (`buildGeneticGraph`) — edge de-dup (§4.4).
- `genetics/status.ts` + `genetics/computeStatuses.ts` + `genetics/patterns/
{autosomal,xLinked}.ts` — the `atRiskHomozygous` flag dimension + the two-sided AR
  rule + the XLR daughter rule (§4.2–4.3).
- `interfaces/NarrativePedigree/components/{StickerNode,ClassicNotationNode}.tsx` —
  surface the flag (non-reassuring copy).
- Stories: `FamilyPedigree.consanguinity.stories.tsx` (representation +
  creation-via-wizard); genetics + connector unit tests.

---

## §6 — Research-team sign-off gate (BLOCKING for merge)

The §4 genetics changes fold into the **existing PR #713 genetics human/domain gate**.
They must not merge without research-team sign-off on:

1. **The taxonomy change (the combined AR + XLR decision):** the non-lattice
   `atRiskHomozygous` flag is the geneticist-preferred resolution of "certain carrier
   **and** at-risk affected" on one node. Confirm this over the alternatives
   (explicit lattice override; a new compound status).
2. **The two-sided threshold:** whether **two merely-`atRiskCarrier`** parents (two
   low priors, neither obligate) should set the **same** flag as two obligate-carrier
   parents — there is no magnitude tier. Builder recommends _yes_; needs explicit
   sign-off.
3. **Known-carrier seeding:** today the only seed is `affected`; a bare nominated
   _known carrier_ (unaffected Aa) is never seeded. If the product lets users nominate
   a known carrier, it needs its own seed set and interacts with the threshold above.
4. **Degree scaling:** F differs by relationship (first cousins 1/16, double-first
   1/8, second cousins 1/64); the categorical taxonomy collapses all to one flag.
   Confirm no F-graded distinction is wanted.
5. **Multifactorial:** consanguinity raises empiric recurrence risk, but the engine
   makes no inference there by design (`affectedOnly`). Confirm that remains the
   accepted behaviour (a non-categorical empiric-risk surface would be a separate
   feature).

---

## §7 — Out of scope (YAGNI)

- No "consanguinity"/"degree" data field (derived from structure, per all standards).
- No first-degree (parent/child/full-sib) unions in the partner picker.
- No F-magnitude tiers in the genetics output (categorical collapses all degrees).
- No multifactorial empiric-risk surfacing.
- No new twin-zygosity / multiple-mating / separation UI beyond what already exists.
- No interoperable GA4GH-Pedigree export (noted by the literature as the modern
  target, but out of scope here).

---

## §8 — References

Standards & literature (from the research workflow): Bennett et al.,
_Standardized Human Pedigree Nomenclature_ (1995 _AJHG_; 2008 _J Genet Couns_;
2022 update) — double-line consanguinity, degree labelling, donor/surrogate/adoption/
twin conventions. Woods et al. 2006 (_AJHG_, PMC1474039) and the kinship2 package
(Sinnwell et al. 2014) — autozygosity, F = 1/16 (first cousins), F = kinship of
parents. GA4GH Pedigree (connects multiple individuals / loops) vs FHIR
FamilyMemberHistory (cannot represent consanguinity). PhenoTips / open-pedigree
(link-existing-node + consanguinity detection patterns). Welch et al. 2013
(PMC3540532) — partner-linking as the dominant UX gap. Bishop/Saxby et al. 2008
(_Genet Med_) — consanguinity missed without direct elicitation. Darr et al. 2019
(PMC6615806) and Hamamy et al. 2011 — non-stigmatising framing; consanguineous
marriage normative for ~1 billion people.
