# NarrativePedigree genetics — modelling decisions

This document records the research-gated modelling decisions baked into the
NarrativePedigree genetics engine (`genetics/`). Each entry states **what the
engine does**, the **rationale**, any **citations**, and the **decision reached**.

The engine takes the participant's family as the source Family Pedigree
recorded it (people, their sex assigned at birth, and the relationships
between them; see `familyGenetics.ts`) plus a disease's `InheritancePattern` and computes a per-person `Status` for one selected
condition. Statuses drive the (decorative) pedigree markers and the screen-reader
status summary. The engine is **display-only**: it never writes back to the
network, and every inference is derived from the recorded pedigree structure.

A recurring theme below: **the engine is conservative and evidence-bounded**. When
it emits `unknown` or a lower-severity status, that frequently means _"the recorded
pedigree does not contain enough evidence to say more"_ — **not** _"no risk"_. That
distinction is deliberate and is documented per-decision.

---

## 1. The at-risk-homozygous marker is removed; fill is reserved for affected

### What the engine does

There is **no** separate "at-risk-homozygous" / "may be compound-heterozygous"
signal. The engine computes six statuses only —

```text
affected · obligateAffected · obligateCarrier · atRiskAffected · atRiskCarrier · unknown
```

(`status.ts`) — and no boolean flag, glyph, or notation-key row for inferred
homozygosity exists. The genuine ~25% two-carrier-parents case is carried by
`atRiskAffected` (`autosomal.ts`, assigned when ≥2 of a person's genetic parents
are obligate carriers). A child of two merely-at-risk carriers falls back to
`atRiskCarrier` ("At risk (carrier)"), faithful to their ~50% carrier prior.

A **solid fill** is reserved strictly for the two states that genuinely correspond
to a homozygous/affected genotype: nominated `affected`, and inferred
`obligateAffected` (the pseudodominance case — a child of two affected parents).
No other state is filled.

### Rationale

The prior engine rendered a `HomozygousMarker`: a **solid affected-colour fill
plus a white "?"** that _replaced_ the person's open at-risk glyph whenever a node
had ≥2 parents at `atRiskCarrier`-or-higher. This fired identically on the
participant's genuine ~25% case, on an aunt/uncle's inferred ~6% case, and looked
pixel-identical to an actually-affected sibling's solid fill. It violated the
governing standardized pedigree nomenclature in two independent ways, and it
collided two mutually-exclusive conventions:

- **A solid fill means clinically affected — full stop.** Bennett et al. 2008
  states verbatim, _"A symbol is shaded only when an individual is clinically
  symptomatic"_ (Fig. 4 instructions) and _"Use only when individual is clinically
  affected"_ (Fig. 1 item 2). Applying a fill to an asymptomatic, untested person
  applies affected semantics to someone who is not affected.
- **The standard encodes no probability or degree of risk in any symbol**, and has
  no glyph meaning "may be affected because both parents are carriers." The
  strongest "may become affected" state in the standard is still an _open_ symbol
  (the asymptomatic/presymptomatic-carrier vertical line). Encoding an inferred
  probability in a fill invents a glyph the standard's own maintainers explicitly
  declined to create.
- **The `"?"` collision.** In the standard, `"?"` denotes _missing data_ ("family
  history not available") on an _unshaded_ symbol — the near-opposite of "elevated
  computed risk." Placing `"?"` on a solid fill collides "status unknown" with
  "clinically affected."

Every surveyed mainstream pedigree tool (Progeny, PhenoTips / open-pedigree,
Madeline 2.0) shades only from entered affected/obligate facts, never from computed
probability; probabilistic engines (CanRisk/BOADICEA, Tyrer-Cuzick) keep
probability _off_ the symbol and express it numerically. NarrativePedigree is shown
to **lay research participants**, so health-literacy effects (categorical-gist
collapse, denominator neglect, salience/dread) mean a filled shape reads as the
categorical "has it" bucket regardless of the intended probability — a documented
source of avoidable distress. No warranted signal is lost by removal: the real 25%
lives in `atRiskAffected`, and each converging confirmed line is carried by its
parent's `obligateCarrier` plus the child's `atRiskAffected`.

### Citations

- Bennett RL, French KS, Resta RG, Doyle DL (2008). _Standardized Human Pedigree
  Nomenclature: Update and Assessment of the Recommendations of the National
  Society of Genetic Counselors._ J Genet Couns 17:424–433.
  <https://doi.org/10.1007/s10897-008-9169-9>
  (Fig. 1 item 2 "Use only when individual is clinically affected"; Fig. 4
  instructions "A symbol is shaded only when an individual is clinically
  symptomatic"; Fig. 4 items 2–3 carrier / asymptomatic-presymptomatic-carrier
  are _unshaded_; Fig. 2 `"?"` = family history not available, on an _unshaded_
  symbol.)
- Bennett RL, French KS, Resta RG, Austin J (2022). _Practice resource-focused
  revision: Standardized pedigree nomenclature update centered on sex and gender
  inclusivity._ J Genet Couns 31:1238–1248, §4.5.
  <https://doi.org/10.1002/jgc4.1621>
  (Carrier depicted via half-shade/hatch tied to a _documented_ result; central
  dot retired; the committee introduced **no** risk glyph.)

### Decision

**Remove the filled `"?"` override entirely; drop the separate homozygous signal
by default.** Reserve fill for `affected` and `obligateAffected` only. This
de-fills the autosomal-recessive **and** X-linked-recessive paths at once, because
the fix lives at the shared render layer rather than in either pattern rule.

If a future research sign-off decides a distinct "may carry two copies" signal is
genuinely wanted, it **must** satisfy _all_ of the following — none of which the
old marker did:

1. **Never a filled/shaded symbol** (the fill itself is the violation).
2. A **distinct, legend-defined off-symbol annotation** — it must _not_ reuse the
   plain `atRiskCarrier` open glyph, which already carries a `"?"` and would be
   indistinguishable from "May carry."
3. Applied to **both recessive patterns at equivalent obligate-or-higher
   thresholds**, so the same pedigree never flags two recessive conditions at
   different evidential bars.
4. **Researcher-toggle-gated** (the at-risk layer already defaults _off_).
5. Carried by a **single, shared probability-of-two-copies string** used verbatim
   by both the visual key and the screen-reader — never a visual "more seriously
   affected" (severity) framing diverging from a spoken "at risk (homozygous)"
   (probability) framing, as the two surfaces previously did.

---

## 2. MRT egg-cytoplasm inference

### What the engine does

`buildGeneticGraph` maintains two parallel adjacencies per child: the **nuclear**
relation (`parentsOf` / `childrenOf`, autosomal / X / Y) and a **mitochondrial**
relation (`mitochondrialParentsOf` / `mitochondrialChildrenOf`, the egg-cytoplasm
line). `splitParents` (`geneticGraph.ts`) partitions each child's genetic
parents (`biological` and `donor` relationships) by how many are known to have
given an egg:

- **No egg known** → fall back to the sex rule: every genetic parent is nuclear,
  and the mtDNA source is the female-resolved parent(s).
- **1 egg** → that single egg is _both_ the nucleus and the mtDNA source. Normal
  birth and **standard egg donation** are unchanged (the donor egg carries both the
  nuclear contribution and the cytoplasm).
- **≥2 eggs (mitochondrial replacement therapy, MRT)** → the mtDNA source is the
  egg from the **`donor`** relationship (else the first egg); the nuclear parents
  are everyone _except_ that donor egg.

The mtDNA line is a **separate adjacency** — mtDNA does not follow the female
nuclear parent under MRT; it follows the egg cytoplasm. Maternal-lineage inference
(mitochondrial inheritance, X-linked maternal transmission) reads the mitochondrial
adjacency, not the nuclear one.

**Where the gametes come from.** The Family Pedigree records no gametes. It
records each person's sex assigned at birth, and it allows a child at most one
genetic parent recorded female at birth and one recorded male, since one gave
the egg and the other the sperm. `inferGametes` (`familyGenetics.ts`) reads
the gametes back from that:

- a genetic parent recorded female at birth gave the egg, one recorded male the
  sperm;
- a genetic parent recorded otherwise (intersex, not known, preferred not to
  say, or not answered) gave the other gamete when the child's one other
  genetic parent is recorded female or male. This is how the Family Pedigree
  itself fills in an unnamed parent added to complete a pair;
- otherwise the gamete is not known, and the sex rule applies.

So an intersex parent whose co-parent is recorded male gave the egg, and
their children inherit their mtDNA; the egg follows the gamete, not the sex.

### Rationale

In MRT (a.k.a. mitochondrial donation), an intended mother's nuclear genome is
transferred into a **donor egg** whose own nucleus has been removed but whose
**cytoplasm — and therefore its mtDNA — is retained**. The resulting child inherits
their **nuclear** genome from the intended parents but their **mitochondrial** genome
from the _donor_ egg. Modelling mtDNA as "always the female nuclear parent" would
be wrong for exactly this case; the egg-cytoplasm model routes mtDNA down the donor
line correctly.

- **Two established clinical MRT techniques** — **maternal spindle transfer (MST)**
  and **pronuclear transfer (PNT)** — both operate by placing intended-parent
  nuclear material into a donor egg / zygote whose cytoplasm supplies the mtDNA.
  The UK **HFEA** regulates MRT on exactly this basis (nuclear genome from the
  intended parents, mitochondria from the donor).
- **Paternal mtDNA is eliminated**, so the sperm contributes essentially no mtDNA;
  the mitochondrial genome is inherited through the egg cytoplasm alone. This is
  what makes "the egg is the mtDNA source" the correct single-source model.
- For the ordinary cases (normal birth, single-egg donation), "one egg = nucleus +
  mtDNA" is simply the standard maternal-inheritance biology and needs no special
  branch.

### Reachability boundary (important)

**MRT is not authorable through the Family Pedigree participant interface.**
It allows a child at most one genetic parent recorded female at birth, so the
gametes it records can never include two eggs. Standard egg donation, sperm
donation, and surrogacy **are** participant-reachable (a `donor` relationship
from a parent recorded female, or a `surrogate` relationship, which is not
genetic). Two eggs arise only from data the Family Pedigree did not write:
two genetic parents recorded female at birth, in hand-authored fixtures or
imported network data.

### Decision

**Accept the egg-cytoplasm model as correct biology and keep the engine handling;
scope MRT to Architect/import authorship and document that boundary.** The `≥2-egg`
branch stays in the engine and is exercised by a dedicated fixture/story; it is
_not_ carried by the default NarrativePedigree story (which represents
participant-reachable pedigrees). No participant affordance for a second egg is
built.

---

## 3. The ≥2-egg branch trusts coherent tagging (garbage-in/garbage-out)

### What the engine does

`splitParents` **assumes** coherent input and does not validate it. A coherent
MRT birth, in data the Family Pedigree did not write, records two genetic
parents female at birth — so both gave an egg — one of them through a `donor`
relationship. Given that, the engine routes the donor egg to the mtDNA-only
adjacency and the other egg to the nucleus. Malformed input — two eggs with
_no_ `donor` relationship — routes mtDNA/nuclear parentage by **link order**
(the first-egg fallback) rather than by intent.

### Rationale

Coherence holds **at creation**, not by defensive guessing in the display
engine:

- **The participant path is safe by construction** — the Family Pedigree
  cannot record two genetic parents female at birth for one child (see §2).
- **A `@codaco/protocol-validation` schema invariant is not feasible.** That
  package validates the _protocol document_ (codebook + stages + assets); it
  never sees participant **network data** (nodes/edges carrying attribute
  values), which is where such a child would exist. Architect authors protocol
  structure, never network data.
- **The residual risk is confined to hand-authored fixtures / raw imported network
  data** — data that never passes through `@codaco/protocol-validation` at all.

### Decision

**Coherence holds by construction at every supported authoring surface, so no
schema guard is built — and none is cleanly feasible.** For hand-edited or
imported data the engine keeps its simple order-based fallback and documents its
garbage-in/garbage-out trust boundary rather than silently guessing. If
fail-loud behaviour on such input is ever wanted, the appropriate home is a
**dev-only assertion in `buildGeneticGraph`** (throw/warn when ≥2 eggs lack
exactly one `donor` relationship) — not a schema rule, and not silent guessing
in the display path.

---

## 4. Status-precedence lattice

### What the engine does

Where multiple rules assign a status to the same person, `mergeStatus`
(`status.ts`) keeps the **higher-precedence** status via a single ordered lattice
(lower index wins):

```text
affected › obligateAffected › obligateCarrier › atRiskAffected › atRiskCarrier › unknown
```

`assign` (`autosomal.ts` and the other pattern modules) merges every write through
this lattice, and `unknown` is represented by _omission_ from the result map (so a
node absent from the map is `unknown`).

### Rationale

The ordering is not arbitrary severity; it is **certainty-tier-first, then severity
within a tier**:

| Tier              | Certainty                   | Members (severe → mild)               |
| ----------------- | --------------------------- | ------------------------------------- |
| observed          | nominated                   | `affected`                            |
| inferred-certain  | deterministic from pedigree | `obligateAffected`, `obligateCarrier` |
| inferred-probable | probabilistic prior         | `atRiskAffected`, `atRiskCarrier`     |
| none              | no evidence                 | `unknown`                             |

An **observed** affection outranks any _inference_; a **certain** inference
(pseudodominance `obligateAffected`, or an `obligateCarrier`) outranks a
**probable** one; and only _within_ a tier does severity break the tie
(`affected` › `carrier`). This makes the lattice sound and robust to rule
ordering — the merged result does not depend on which rule ran first.

**The within-at-risk severity-forward tiebreak is a deliberate choice.** Inside the
inferred-probable tier, `atRiskAffected` (the ~25% two-carrier-parents case)
outranks `atRiskCarrier` (the ~50% single-carrier-parent case). When both could
apply, the engine surfaces the **worst-case** `atRiskAffected` rather than the modal
`atRiskCarrier`. This is intentional: the whole at-risk layer is
**researcher-toggle-gated** (off by default), and a researcher who has opted into
the probabilistic view is better served by seeing the more serious possibility than
by having it hidden behind the more likely one.

### Decision

**Accept the lattice as-is.** Certainty-tier-first ordering with a deliberate,
toggle-gated severity-forward tiebreak inside the at-risk tier.

---

## 5. Data-completeness behaviours: `unknown`/conservative can mean "insufficient data"

Two engine behaviours deliberately **under-state rather than over-claim** when the
recorded pedigree is incomplete. Both are accepted as-is, and both carry the same
caveat: a conservative or `unknown` status can mean _"not enough data was recorded"_
— it is **not** an assertion of "no risk." Any future "suppressed-because-missing-data"
distinction would be a deliberate nomenclature extension (legend/toggle/sign-off),
not a silent change; and completeness-nudging (prompting the participant to record a
missing parent) belongs in the **FamilyPedigree building UX**, not in this display
engine.

### 5a. Autosomal-recessive sibling downgrade

**What the engine does.** In `computeAutosomalRecessive` (`autosomal.ts`), a
relative is promoted to `atRiskAffected` (the ~25% full-sibling risk) **only when
≥2 of their genetic parents are obligate carriers** — i.e. the full-sibling
relationship is _established_ because both carrier parents are recorded. A relative
with **exactly one** recorded obligate-carrier parent gets `atRiskCarrier` instead.

**Rationale.** The 25% figure is a _full-sibling_ risk: it requires **both** parents
to be carriers. If the pedigree records only one carrier parent — because the second
parent was never entered, or the sibling is genuinely a half-sib — the engine cannot
establish the full-sibling relationship and so cannot justify the 25% claim. It
downgrades to `atRiskCarrier`. This is exact for true full-sibs (both carrier
parents recorded → `atRiskAffected`) and true half-sibs (one shared carrier parent →
`atRiskCarrier`), and it **under-states only on incomplete data** (a full sib whose
second parent was never recorded reads as `atRiskCarrier`). The engine never
over-claims; the shortfall is inherent to the missing record, and closing it is a
data-collection concern, not an inference the engine should manufacture.

**Decision.** **Accept as-is; document the data-completeness dependence. No new
runtime signal.**

### 5b. Sex for the sex-linked rules: intersex and unknown resolve to `unknown`, with a gamete fallback

**What the engine does.** `geneticSexResolver` (`familyGenetics.ts`) resolves
the sex the sex-linked rules read, from the source Family Pedigree's sex
assigned at birth attribute:

1. Recorded `'female'` or `'male'`: that.
2. Recorded `'intersex'`: `'unknown'`, always. Intersex variations include
   chromosome patterns other than XX and XY, so neither one X nor two can be
   assumed, whichever gamete the person gave.
3. Recorded `'unknown'`, `'preferNotToSay'`, or not answered: the sex of the
   gamete they gave a child (egg → `'female'`, sperm → `'male'`), as
   `inferGametes` reads it (§2), when that is known and consistent.
4. Otherwise `'unknown'`.

Gender identity has no bearing on it.

**Rationale.** Sex-linked patterns need a _biological_ sex signal, but the engine
must neither guess nor mis-gender. Step 2 refuses to invent a chromosome count
from an intersex answer, and step 1 never coerces a non-binary or withheld
answer into a binary one — both are treated as **uncertainty**, which the
sex-linked rules handle conservatively. Step 3 is **inclusive**: a gamete
contribution is a factual biological signal that places a person who did not
state their sex on a sex-linked lineage without asking them to. (The
mitochondrial line does not need step 3: it follows the egg itself, §2, so it
reaches an intersex person's children too.) `'unknown'` is returned only where
the engine genuinely lacks the biological signal a sex-linked rule needs, and
means _"insufficient data to place this person on a sex-linked lineage,"_ not
"no risk."

**Decision.** **Accept as-is; document the data-completeness dependence and the
inclusive gamete fallback. No new runtime signal.**
