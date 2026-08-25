---
'@codaco/protocol-validation': major
'@codaco/shared-consts': minor
'@codaco/network-query': minor
'@codaco/interview': major
'@codaco/protocol-utilities': major
'@codaco/architect': minor
'@codaco/interviewer': patch
'fresco': patch
'@codaco/protocols': patch
---

Protocols can now describe how a synthetic interview should answer them. Every
stage, panel, prompt, and codebook variable accepts an optional `synthetic`
block carrying the parameters generation needs — how many people a name
generator draws, how likely a nomination from a panel is, how the options of a
question are weighted, how often an answer is left blank, and how much of a
participant's attention a stage asks for. The surface is entirely additive: a
protocol that authors none of it validates exactly as it did before, and
wherever an author writes nothing, the default is derived from the rules that
variable is already held to rather than looked up in a table, so no protocol
that was valid becomes invalid. The rules an interface already imposes on a
variable now carry the stage imposing them, and the distribution shapes each
parameter admits are exported along with their bounds — so an authoring surface
can offer exactly the choices the format accepts, and say which stage has
already decided the rest. A demonstration protocol exercising the whole authored
surface ships with the bundled protocols as `synthetic-showcase`.

`@codaco/protocol-validation`'s published TypeScript surface changes shape:
parsed `CurrentProtocol` stages now carry a required `synthetic` block (the
schema resolves one during parsing), and `migrateProtocol` returns the wider
`CurrentProtocolDocument` rather than `CurrentProtocol`. Consumers that
construct `CurrentProtocol` values by hand, or assign a migration result to
that type, must parse through `CurrentProtocolSchema` to recover the resolved
type — which is why this release is a major.

Two pieces of the interview contract move to the packages that own them.
`SessionPayload` and `StageMetadataEntry` now live in `@codaco/shared-consts`,
and stage availability — `buildStageAvailabilityMap` with its
`StageAvailability` and `UnavailableStage` types — now lives in
`@codaco/network-query`. `@codaco/interview` re-exports all of them from the
entry points that exported them before, so existing imports keep resolving
unchanged. One published type narrows: `SessionPayload` no longer carries
`stageRequiresEncryption`. No code ever set it and no host persisted it, so
removing it loses nothing, but a host that names the field in its own types
should drop it.

Interviewer and Fresco now identify an imported protocol by the contents of the
file it arrived in, read before validation fills in anything the author left
unwritten. A protocol saved in the current format keeps the identity it was
stored under as the format grows, so importing the same file again is still
recognised as the copy you already have. The one exception is a protocol
containing a Narrative Pedigree stage that leaves its at-risk display setting
unwritten: the first import after this release records it under a new identity.

Architect can now author every one of those parameters, and shows what
generation would do wherever they are set.

- **Every stage editor** gains a collapsed "Synthetic data" section that
  explains what synthetic data is for and summarises what the stage
  contributes to a generated interview — how many people it creates, how
  densely it links them, and how much of a participant's attention it asks
  for — with a reset that returns any hand-written value to the default.
  Expanded, every parameter gets its own editor, alongside a self-scaling
  picture of the distribution over the range it is allowed, and the
  attributes the stage itself assigns (a bin's variable, a quick-add's name
  field) can be shaped right there — the same setting the Codebook shows.
- **Side panels** gain the same treatment for how likely a participant is to
  re-nominate the people a panel puts in front of them.
- **The Codebook** gains per-attribute settings: how values are spread, how
  often an answer is left blank, what generated text looks like, how many
  options a multiple-choice question picks, and — revealed in the options list
  while the attribute's section is open — a relative weight for each option.
  Dates get the whole of what the format allows: spread evenly or gathered
  around a date you choose, within a window measured in days either side of
  the interview (from the interview day, or from a fixed date), or between an
  earliest and a latest date entered at the attribute's own resolution.
- **Categorical Bin prompts** gain the odds a generated participant reaches
  past the categories on offer and uses the prompt's "other" bin, alongside
  the other-bin settings themselves.
- **The Codebook** also carries the protocol-wide picture: a banner says
  whether the protocol as a whole can generate, and every attribute row shows
  the value generation would use and opens for editing in place.
- **Architect generates synthetic interview data itself**: a "Generate
  synthetic data…" action asks how many sessions to fabricate (with drop-out
  and skip-logic toggles, and an optional batch token), runs the same
  generation Interviewer uses, and downloads a ready-made CSV and GraphML
  export archive — named so a fabricated archive can never be mistaken for a
  real study's data. Every batch reports the token it ran on, in the same form
  Interviewer reports its own: entering it generates exactly those interviews
  again, dates included.

No control can produce a value the protocol format would reject: every field is
held to the range its own rules allow, and problems no single field can express
— a roster too small for the number of people a stage insists on, an attribute
that must be unique with fewer possible values than the people who need one —
are reported as you edit, in the same words a generation run would refuse with.
Where an interface has already decided part of an answer — a quick-add stage
that always fills a value, a bin that assigns exactly one option — the control
is disabled and says which stage decided it.

Authoring is opt-in throughout: a protocol nobody has touched carries nothing,
and resetting a section removes what it wrote rather than writing the default
down. Parameters also survive ordinary editing untouched — opening and saving a
stage, adding or reordering or removing a panel, and editing an attribute all
leave a `synthetic` block exactly as its author wrote it, and a stage that
carries none is saved exactly as before. Where an edit somewhere else makes a
setting impossible, the setting gives way rather than the protocol: renaming or
removing an option drops only the weight that named it, narrowing an
attribute's allowed range or coarsening a date question's resolution drops only
the setting that range or resolution can no longer hold, changing a panel's
data source to a roster file takes its nomination odds with it, and narrowing a
stage's alter limits under a hand-written number of people is refused before
the stage can be saved.

Architect's stage preview draws its synthetic data from the same walk, and the
preview setting that switches it on is now called "Start preview with synthetic
data". Previewing a stage now runs a synthetic participant through everything
before it and stops on arrival, so the stage opens the way a participant would
meet it — with the network the earlier stages built and nothing yet answered on
the stage itself.
Roster resources and Geospatial maps feed the preview directly, so people come
from the roster the protocol actually ships and map answers from the areas the
map actually offers. Previews are also reproducible: the same protocol previews
the same way every time, so a change is compared against the last preview
rather than against a fresh draw.

`@codaco/protocol-utilities` is rebuilt around these parameters. Synthetic
interviews are now generated by walking a protocol stage by stage the way a
participant would, and the result is a complete session — network, stage
metadata, timestamps, and resume position — rather than a bare network.
`generateNetwork`, `GenerationConfig`, and the payload-generating half of the
old builder are replaced by `generateInterviews` and `ProtocolBuilder`. A batch
asked for from a browser is drawn through `generateInterviewsAsync`, which
produces the identical batch while handing the thread back between interviews —
so a run of a thousand sessions reports its progress as it goes, instead of
leaving the page unresponsive until the whole batch is finished.

Fresco's generate-test-interviews route runs on the same engine. The stored
protocol is re-parsed at the boundary, roster and map assets are resolved
server-side from the protocol's own uploaded files, progress streams as the
batch generates and saves, and the completion event reports the seed so an API
caller can reproduce a batch exactly. Drop-outs are stored as genuine
unfinished interviews with the position a participant would resume from.

A protocol whose declared constraints cannot all be satisfied at once is now
refused before anything is drawn, with a structured explanation naming the
stage, the variables, and the rules in conflict — the same refusal on every
seed, in every host. A roster stage whose source cannot be read, a unique
variable with fewer possible values than the people who must hold one, and a
census asked to enumerate more pairs than a participant could answer are all
caught this way instead of producing data no real interview could contain. That
check is exported as `analyseSyntheticFeasibility`, and each conflict it returns
names the stage it belongs to, so a host can run the very gate generation runs
against a protocol still being edited and show the refusal where it applies.

Interviewer's synthetic data generator runs on that engine. Generated sessions
now start spread across the days before the batch was made and finish after
however long their stages would have taken a participant, and a session that is
abandoned part-way stays abandoned — a genuine unfinished interview you can
resume from where it stopped. Every batch reports the seed it ran on, and
Settings takes a seed of your own: the same seed, protocol, and options always
produce the same interviews, down to the case IDs. Skip logic and filtering are
now respected by default, and roster-backed and map-backed stages draw from the
protocol's own asset files, so generated answers are ones the protocol could
actually have collected.
