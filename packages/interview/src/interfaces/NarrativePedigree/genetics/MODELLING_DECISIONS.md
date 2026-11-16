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
the egg and the other the sperm. `inferGametes`
(`FamilyPedigree/gametes.ts`, the one rule the Family Pedigree's kinship words
also use; see `FamilyPedigree/REPRODUCTIVE_ROLE_AND_SEX.md`) reads the gametes
back from that:

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

---

## 6. X-linked recessive: a female recorded as affected passes risk to her children

### What the engine does

In `computeXLinkedRecessive` (`patterns/xLinked.ts`), every female recorded as
affected is a starting point for the same downward walk that a carrier female
starts (step 3): her daughters get `atRiskCarrier`, her sons get
`atRiskAffected`, and the walk continues down through her daughters exactly as
it does from a carrier. Her own status stays `affected`. On its own, her being
affected adds nothing about her parents; it can count as one side of her mother
in the rule of §7. An affected
person of uncertain sex is not a starting point, because neither the male nor
the female rule can be applied to them. Every write goes through the precedence lattice
(§4), so a stronger status reached by another rule is kept: a daughter who also
has an affected father stays `obligateCarrier`, and a child recorded as affected
stays `affected`. A child of uncertain sex is left `unknown` and the walk does
not continue through them (§5b).

### Rationale

**Her children are at risk, never certain.** A woman recorded as affected by an
X-linked recessive condition may be homozygous, or she may be a manifesting
heterozygote (for example through skewed X-inactivation). A homozygous mother
passes a disease X to every child; a manifesting heterozygote passes it to about
half. The recorded pedigree cannot tell these apart, so the engine assumes
neither and gives her children the at-risk statuses a carrier mother's children
get. This under-states the homozygous case rather than over-claiming certainty
for the heterozygous one, in line with the conservative stance of §5.

**On its own, she adds nothing about her parents.** A homozygous daughter implies a carrier mother
and an affected father, but a manifesting heterozygote implies only that one
parent passed a disease X, and a de novo variant implies neither. Because the
engine does not decide which of these applies, it adds no inference upward from
her alone. Her parents still receive any status the other rules give them, and
§7 counts her for her mother when her father is recorded and the condition also
shows elsewhere.

**The earlier behaviour was an oversight.** The carrier-female helpers return
early for anyone in the affected set, so an affected woman was never a seed for
step 3. Her children were marked only when her own mother happened to be a
derived carrier, because the walk then reached her as a daughter and continued
through her. The same woman's children therefore got statuses in one family (an
affected woman whose mother has two affected sons) and none in another (an
affected woman whose only recorded affected relative is her father), and a lone
affected woman's children got none at all.

### Decision

**Seed the step-3 walk from every affected female, with at-risk statuses for
her children and no upward inference from her own status alone.** The status of her
children no longer depends on whether her mother happened to be marked a
carrier.

---

## 7. X-linked recessive: a woman with the condition on two sides of her is an obligate carrier

### What the engine does

Step 2b of `computeXLinkedRecessive` marks a woman who is not recorded affected
`obligateCarrier` when the condition shows on two sides of her. A side is one
of these:

- an affected son of hers;
- the lines of all her genetic daughters by one recorded father;
- the lines of all her genetic daughters with no recorded father, but only when
  no recorded father's daughters give a side. Otherwise their affected people
  join one recorded father's side and add no side of their own;
- her genetic mother's family.

A daughter's line is the daughter, if she is affected, together with the lines
of the daughter's own children (a son's line being the son, if he is affected).
Her mother's family is her mother, if affected; her mother's affected father;
the lines of her mother's other genetic children, counted the same way; and her
mother's own mother's family, recursively.

Two conditions apply to every female a route passes down through: the woman's
daughter, but equally her sister, aunt, niece or cousin.

- Nothing passes through her when another genetic parent of hers is affected,
  because that parent's X would explain everything below her.
- If she is recorded affected, she counts as evidence only when she also has a
  recorded male genetic parent other than her mother. A female who only links
  to affected people further down needs no recorded father.

Both sides must rest on at least two different affected people, so one person
reached along two routes in a consanguineous family is not enough. A set of
people already on the current route stops the walk, so loops terminate and the
woman's own line is never counted as part of her mother's family. Only
biological and donor links count, on every link of a route: an adoptive, social
or gestational link breaks it, and a son conceived with a donor egg belongs to
the egg donor's lines. A person whose sex is uncertain gives no evidence and the
walk does not pass through them. The existing rule for daughters of an affected
father, the at-risk markings of step 2, the step-3 walk and the precedence
lattice (§4) are unchanged. A woman marked here passes the statuses an obligate
carrier's children get through step 3.

The rule judges each woman separately. The women between her and the affected
relatives on her two sides are usually marked by the same rule, but not always.
A woman whose only lines are those of daughters by one father, or of daughters
by one recorded father and daughters with none, has one side, so the mother of
two sisters is not marked on their lines alone. Nor is a woman
marked through a daughter whose father is affected.

### Rationale

For a woman with one affected son, the only alternatives are that she carries
the disease X or that it arose as a new variant in him. The two-affected-sons
rule already accepts that two independent findings make the new-variant
alternative negligible. Any finding in her mother's family raises her prior of
carrying from near zero to a substantial fraction, and the affected son then
leaves only a coincident new variant as the alternative, so the same reasoning
applies. The rule is the general form of the earlier corroborations (two
affected sons, an affected son with an affected maternal brother, an affected
son with an affected mother), and it adds the cases those left out: an affected
maternal uncle, an affected sister sharing her mother, a carrier mother, an
affected grandson through a daughter.

This reverses an earlier refusal to count an affected maternal grandfather.
That refusal treated his transmission to the woman as at most one half, and
ignored that her affected son makes the alternative a coincidence. Affected men
reached only through an unbroken male line (the woman's father's relatives, or
a male-line great-grandfather) still give nothing, because no X passes from
father to son.

Daughters by one father are one side because one event in him explains all of
their lines without the woman carrying anything: he may be a germline mosaic
(new X-linked variants arise mostly in the male germline), or he may be affected
and not recorded as such. That is a single event, of the same order as the new
variant the rule already sets aside, and no clinical definition makes a woman an
obligate carrier without an affected son or an affected father. Daughters by
different fathers need two such events, so they are two sides. Daughters with no
recorded father may share one father, so they are grouped, and that father may
be one of the recorded men; in practice he is usually the same partner, not
entered a second time. So they give a side only when no recorded father's
daughters do, and a woman with an affected daughter by a recorded man and an
affected grandson through a daughter with no recorded father has one side.

An affected daughter counts for her mother only inside this rule. On its own she
adds nothing (§6), and a single line with any number of affected people in it is
still one side. An affected female whose father is not recorded is not counted,
because her father is too likely to be the source: an affected man passes his X
to every daughter. A female who only links to affected people further down is
different. An unrecorded father who is affected would explain her line, but
that is one event, the kind the rule already sets aside once another side
exists, so requiring a recorded father there would only withhold the status
from common families (an affected cousin through a maternal aunt, an affected
nephew through a sister) where the father is simply missing from the pedigree.

One conservative case remains. An affected female with no recorded father gives
nothing, so an affected sister with an unrecorded father does not corroborate an
affected son.

### Decision

**Mark a woman an obligate carrier when the condition shows on two sides of her,
through genetic links only, on two different affected people, with her
daughters by one father counted as one side.**

---

## 8. Focus highlighting: a carrier daughter of an affected father

### What the code does

When a person is focused, `transmittingParents` in `highlight.ts` decides which
parents the highlighted path climbs through. Under X-linked recessive, for a
female who carries the condition and whose father is affected (or inferred
affected), the path runs only through her father, whatever her mother's status.
If she is herself recorded affected, the path runs through both parents.

### Rationale

Her carrier status is fully explained by the X her affected father gave her.
Earlier code also kept the maternal line when the mother was affected, on the
assumption that an affected woman has two copies and passes a disease X to
every child. Section 6 does not make that assumption, so the exception was
removed. A daughter recorded affected may have received a copy from each
parent, so her mother's line is kept as a possible source.

### Decision

**For a carrier daughter of an affected father, highlight only the paternal
path unless she is herself affected.** A woman made an obligate carrier by §7
through her mother's family has her path run through her mother. If her father
is also affected, her path runs only through him, as for any carrier daughter of
an affected father.
