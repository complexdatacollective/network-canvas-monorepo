import { z } from 'zod';

import { isDeclaredExclusiveVariants } from './declared-variants.ts';
import { stageSchema } from './stages/index.ts';

/**
 * How a path spells "every row of the list above".
 *
 * A list's rows are not addressable — a position means something different the
 * moment anything inserts a row above it — so a path through one names the
 * rows rather than a row. A consumer holding a list's path builds a row's own
 * path by appending this, and asks about a property of a row by appending its
 * key after that.
 */
export const VARIANT_ROW_SEGMENT = '*';

/**
 * The places in a stage document where the schema offers several MUTUALLY
 * EXCLUSIVE shapes for one object, so that a document holding a mixture of two
 * of them is a document the schema refuses.
 *
 * A sociogram's `background` is one: an image, or a number of concentric
 * circles, and never both (`imageOrCirclesBackgroundSchema` says so twice —
 * once as an author-facing refinement, once as the union it narrows to). A
 * family pedigree's `framing` is another, discriminated on `mode`. So is the
 * `destination` a skip-logic rule jumps to, discriminated on `type`.
 *
 * Read off the schemas themselves rather than written down beside them,
 * because a list of paths maintained by hand is a list that goes stale the
 * first time a stage type gains a variant: the author who adds the variant is
 * not the author who knows this rule exists. Every consumer therefore asks the
 * schema, and a new variant answers for itself.
 *
 * Which consumer, and why it needs asking, is the protocol builder's draft
 * diff: it addresses a change at the deepest place the difference actually is,
 * so that a sibling nobody touched is not rewritten — and for one of these
 * containers that granularity is not merely lossy but wrong. A `set` of
 * `background.image` replayed onto a base a collaborator has switched to
 * concentric circles leaves BOTH members set, which is a draft the researcher
 * cannot save and did not ask for. The variant is the unit of meaning, so the
 * whole of it travels and the later write wins whole.
 *
 * The same consumer asks again one level down. No command addresses a list's
 * row — the vocabulary addresses object keys, and a rewritten row travels as a
 * whole-list `set` — but the merge that replays such a `set` re-seats the row
 * on the one the session holds LEAF by leaf, so that a collaborator's edit to
 * another property of the same row survives. That is the same granularity, and
 * it makes the same hybrid: a sociogram prompt with highlighting switched on
 * and no attribute left to write. So a path may run through a list, naming its
 * rows with `VARIANT_ROW_SEGMENT`.
 */

/**
 * How a path is spelled as a key.
 *
 * A document key may contain a dot, so the segments are joined with a
 * character no key can hold rather than with one that reads nicely. Written as
 * an ESCAPE and never as the byte itself: a source file carrying a literal NUL
 * is one git calls binary, and this file then arrives in a review as
 * "Binary files differ" rather than as the diff somebody has to read.
 */
const asKey = (path: readonly string[]): string => path.join('\0');

/** The schema a wrapper is wrapped around, unwrapped as far as it goes. */
function innerSchema(schema: z.core.$ZodType): z.core.$ZodType {
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodNonOptional ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodCatch
  ) {
    return innerSchema(schema.def.innerType);
  }
  if (schema instanceof z.ZodLazy) return innerSchema(schema.def.getter());
  return schema;
}

/**
 * One container the walk found, and the schema that judges it.
 *
 * `jointlyConstrained` is the reading a consumer that ASSEMBLES a container
 * needs: whether the schema says something about the members TOGETHER, so that
 * a value made of members each side is entitled to can still be one the schema
 * refuses. Two shapes to choose between is one way to say that — it is the
 * whole of what `EXCLUSIVE_VARIANT_CONTAINERS` is about — and a check on the
 * object is the other: a sociogram prompt must set an edge to create or a
 * non-empty list of edges to draw, a name generator's `maxNodes` may not fall
 * below its `minNodes`, a composer form field's `parameters` have to match the
 * control it names.
 */
type DeclaredContainer = Readonly<{
  path: string[];
  schema: z.ZodType;
  jointlyConstrained: boolean;
}>;

/**
 * What a walk of one stage schema found: the variant containers, the places it
 * could not see into, and every container it passed with the schema that
 * judges it.
 *
 * The second is not a curiosity. A variant declared with `.transform()` rather
 * than with `.pipe()` — the shape `narrowTo` in `common/prompts.ts` uses — is
 * a function this cannot look through, so a variant hidden behind one would be
 * missed silently. Both of the schemas built that way say so themselves (see
 * `asExclusiveVariants`); every OTHER such place is reported here, and the test
 * beside this file fails on one, rather than leaving a variant silently out of
 * the list and addressed a member at a time.
 */
type VariantScan = Readonly<{
  variants: string[][];
  /** Every path the walk reached and did NOT record as a variant. */
  ordinary: string[][];
  unreadable: string[][];
  containers: DeclaredContainer[];
}>;

/** Whether a union is a choice between object SHAPES rather than values. */
const isVariantUnion = (schema: z.core.$ZodType): boolean =>
  schema instanceof z.ZodUnion &&
  schema.def.options.length > 0 &&
  schema.def.options.every(
    (option) => innerSchema(option) instanceof z.ZodObject,
  );

/**
 * Whether an object schema says something about its members TOGETHER.
 *
 * A `refine`, a `superRefine` and a `check` all land in the same place — the
 * object's own `checks` — so the question is asked of the schema rather than
 * of the source that built it, and a rule added by any of the three answers
 * for itself. Member-level rules are not this: `z.string().min(1)` is a check
 * on the STRING, and a member the object holds is walked into on its own.
 */
const constrainsMembersJointly = (schema: z.ZodObject): boolean =>
  (schema.def.checks?.length ?? 0) > 0;

/**
 * Descends through the object members of one schema, collecting both.
 *
 * `ancestors` is the chain of objects this path was reached through, so a
 * schema that refers back to one of them is a cycle to stop at rather than a
 * walk that never ends. Nothing in the stage schemas is recursive today, and
 * this runs at import.
 */
function scanObject(
  schema: z.ZodObject,
  path: readonly string[],
  ancestors: readonly z.ZodObject[],
  found: VariantScan,
): void {
  if (ancestors.includes(schema)) return;
  const chain = [...ancestors, schema];
  for (const [key, member] of Object.entries(schema.def.shape)) {
    scanValue(member, [...path, key], chain, found);
  }
}

/**
 * One place in a stage document: an object's member, or a list's row.
 *
 * A list IS descended into, through the row segment. No command addresses a row
 * — the vocabulary addresses object keys and edits a list as rows — but the
 * merge that replays a rewritten row re-seats it on the row the session holds
 * LEAF by leaf, and that is the same granularity, one level down. A variant
 * inside a row makes the same hybrid there: a sociogram prompt with
 * highlighting switched on and no attribute left to write.
 */
function scanValue(
  schema: z.core.$ZodType,
  here: readonly string[],
  chain: readonly z.ZodObject[],
  found: VariantScan,
): void {
  const inner = innerSchema(schema);
  // A refined shape narrowed to its variants: what a valid document holds is
  // what comes out of the pipe, so that is what is read.
  const value = inner instanceof z.ZodPipe ? innerSchema(inner.def.out) : inner;
  const variant = isVariantUnion(value) || isDeclaredExclusiveVariants(inner);
  // The schema that judges a value at this path, whatever shape it is: the
  // pipe for a narrowed variant, the object for everything else. `inner` and
  // not `schema`, so that a container the document HOLDS is judged by what it
  // has to be rather than by the optionality of having it at all.
  if ((variant || value instanceof z.ZodObject) && inner instanceof z.ZodType) {
    found.containers.push({
      path: [...here],
      schema: inner,
      jointlyConstrained:
        variant ||
        (value instanceof z.ZodObject && constrainsMembersJointly(value)),
    });
  }
  if (variant) {
    found.variants.push([...here]);
    return;
  }
  found.ordinary.push([...here]);
  if (value instanceof z.ZodObject) {
    scanObject(value, here, chain, found);
    return;
  }
  if (value instanceof z.ZodArray) {
    scanValue(value.def.element, [...here, VARIANT_ROW_SEGMENT], chain, found);
    return;
  }
  // A pipe whose output is not a schema of its own — a transform — is the one
  // construct that can hide a variant from this walk, and one that has not
  // declared itself is one nothing here can see into. See `VariantScan`.
  if (inner instanceof z.ZodPipe) found.unreadable.push([...here]);
}

function scanStages(): VariantScan {
  const found: VariantScan = {
    variants: [],
    ordinary: [],
    unreadable: [],
    containers: [],
  };
  for (const stage of stageSchema.def.options) {
    const schema = innerSchema(stage);
    if (schema instanceof z.ZodObject) scanObject(schema, [], [], found);
  }
  return found;
}

const SCANNED = scanStages();

/**
 * A path one stage type declares a variant and another declares an ordinary
 * object, so that nothing can be said about it without knowing which stage
 * this is.
 *
 * `prompts.*` is the one: a categorical bin's prompt is a choice between two
 * shapes — one offering an 'other' option, carrying all three of the fields
 * that describe it, and one carrying none of them — while every other stage
 * type's prompt is an ordinary row. Answering "variant" for all of them would
 * give the researcher's whole prompt row to whoever touched it and throw away
 * a collaborator's edit to another property of the same row; answering
 * "ordinary" for all of them leaves a categorical bin prompt able to hold half
 * of each shape.
 *
 * So it is answered for NEITHER, and named here instead: the consumers that
 * ask are handed a stage's fields rather than its type, and the honest answer
 * to a question they cannot ask is no answer. Kept as a list rather than as
 * silence so that a stage type creating a new one is a test failure.
 */
const ORDINARY_KEYS = new Set(SCANNED.ordinary.map(asKey));

/**
 * Every exclusive-variant container any stage type declares, as a path from
 * the stage document's own root, with `VARIANT_ROW_SEGMENT` for a list this
 * path runs through.
 *
 * One list across all the stage types rather than one per type, because a path
 * that is a variant in the stage that has it is not an ordinary object in a
 * stage that does not — no stage type declares `background`, `framing` or a
 * skip-logic `destination` as anything else — and the consumer that asks is a
 * diff of two drafts, which is handed the fields and not the type.
 */
export const EXCLUSIVE_VARIANT_CONTAINERS: readonly (readonly string[])[] =
  Object.freeze(
    [...new Map(SCANNED.variants.map((path) => [asKey(path), path])).values()]
      .filter((path) => !ORDINARY_KEYS.has(asKey(path)))
      .toSorted((one, other) => asKey(one).localeCompare(asKey(other)))
      .map((path) => Object.freeze([...path])),
  );

/**
 * The paths a stage type calls a variant and another stage type calls an
 * ordinary object, which are therefore left out of the list above. See
 * `ORDINARY_KEYS`; the test beside this file pins them.
 */
export const AMBIGUOUS_VARIANT_CONTAINERS: readonly (readonly string[])[] =
  Object.freeze(
    [...new Map(SCANNED.variants.map((path) => [asKey(path), path])).values()]
      .filter((path) => ORDINARY_KEYS.has(asKey(path)))
      .toSorted((one, other) => asKey(one).localeCompare(asKey(other)))
      .map((path) => Object.freeze([...path])),
  );

/**
 * The object paths this walk could not see into, for the test that keeps the
 * list above honest. Empty, and it has to stay that way: see `VariantScan`.
 */
export const UNREADABLE_STAGE_CONTAINERS: readonly (readonly string[])[] =
  Object.freeze(
    [...new Map(SCANNED.unreadable.map((path) => [asKey(path), path])).values()]
      .toSorted((one, other) => asKey(one).localeCompare(asKey(other)))
      .map((path) => Object.freeze([...path])),
  );

const VARIANT_KEYS = new Set(EXCLUSIVE_VARIANT_CONTAINERS.map(asKey));

/**
 * Whether the object at this path inside a stage document is one of several
 * mutually exclusive variants, so that it may only be written whole.
 *
 * A path through a list names its rows with `VARIANT_ROW_SEGMENT`, so a caller
 * holding a list's own path asks about its rows by appending that, and about a
 * property of a row by appending the property's key after it.
 */
export const isExclusiveVariantContainer = (path: readonly string[]): boolean =>
  VARIANT_KEYS.has(asKey(path));

/**
 * The containers whose members constrain ONE ANOTHER without being rivals, so
 * that a value assembled out of members each side is entitled to can still be
 * one the schema refuses.
 *
 * A sociogram prompt's `edges` is the shape this exists for: it says which
 * edges to draw and which the participant may create, and the schema requires
 * at least one of the two, because an empty `edges` has no effect. The
 * researcher clears `create` while a collaborator empties `display`, and a
 * merge that goes leaf by leaf answers with `{ display: [] }` — a prompt
 * NEITHER of them held. The exclusive-variant answer cannot be used: the two
 * members are not rival shapes, and keeping both people's work on them is the
 * reason the merge goes leaf by leaf in the first place. So the container is
 * assembled as it always was and then PUT TO the schema, and only a refusal
 * makes the researcher's own container travel whole.
 *
 * Every schema declared at the path is kept, not just the constraining one,
 * because a consumer that asks is handed a stage's fields and not its type: a
 * name generator's prompt row and a sociogram's are both `prompts.*`, and
 * judging the first by the second's schema would call every name generator
 * prompt refused. A container is refused only when NO stage type's schema for
 * that path accepts it, which is the conservative direction — the answer is
 * used to throw away a collaborator's work, so it is given only where nothing
 * in the schema can read the value as a stage.
 *
 * A path `EXCLUSIVE_VARIANT_CONTAINERS` already answers for is left out: the
 * whole container travels there, so nothing is ever assembled to ask about.
 * A path where one stage type declares a variant and another an ordinary
 * object — `prompts.*`, see `AMBIGUOUS_VARIANT_CONTAINERS` — is NOT left out,
 * and this is the only rule that reaches it.
 */
const CONSTRAINED_SCHEMAS: ReadonlyMap<
  string,
  Readonly<{ path: readonly string[]; schemas: readonly z.ZodType[] }>
> = (() => {
  const byPath = new Map<
    string,
    { path: readonly string[]; schemas: Set<z.ZodType>; constrained: boolean }
  >();
  for (const container of SCANNED.containers) {
    const key = asKey(container.path);
    const entry = byPath.get(key) ?? {
      path: Object.freeze([...container.path]),
      schemas: new Set<z.ZodType>(),
      constrained: false,
    };
    entry.schemas.add(container.schema);
    entry.constrained ||= container.jointlyConstrained;
    byPath.set(key, entry);
  }
  return new Map(
    [...byPath]
      .filter(([key, entry]) => entry.constrained && !VARIANT_KEYS.has(key))
      .map(
        ([key, entry]) =>
          [key, { path: entry.path, schemas: [...entry.schemas] }] as const,
      ),
  );
})();

/**
 * The paths above, for the test that pins them: a stage type gaining a rule
 * about two of a container's members together changes how a merge that
 * assembles that container is answered, so the change has to be read by
 * somebody.
 */
export const CONSTRAINED_CONTAINERS: readonly (readonly string[])[] =
  Object.freeze(
    [...CONSTRAINED_SCHEMAS.values()]
      .map((entry) => entry.path)
      .toSorted((one, other) => asKey(one).localeCompare(asKey(other))),
  );

/**
 * Whether the schema refuses this container outright — `false` everywhere it
 * has nothing to say.
 *
 * `false` for a path whose members do not constrain one another, so that a
 * caller may ask about every container it assembles and pay for a parse only
 * where the answer can differ from "the members are each fine".
 */
export const schemaRefusesContainer = (
  path: readonly string[],
  value: unknown,
): boolean => {
  const entry = CONSTRAINED_SCHEMAS.get(asKey(path));
  if (entry === undefined) return false;
  return !entry.schemas.some((schema) => schema.safeParse(value).success);
};
