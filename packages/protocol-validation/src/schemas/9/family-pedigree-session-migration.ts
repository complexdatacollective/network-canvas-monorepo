/**
 * The schema 8 to 9 translation of a session's Family Pedigree stage record,
 * run by `migrationV8toV9`'s session step, after the migration framework has
 * moved every stage record to its stage's new index.
 *
 * WHAT SCHEMA 8 KEPT. The schema 8 interview held the family a participant was
 * building in memory only, and wrote it to the session network when they
 * finalized the pedigree. The stage record (`stageMetadata[index]`) then held:
 *
 * - `isNetworkCommitted`: true once finalized; `{ isNetworkCommitted: false }`
 *   is what resetting the pedigree left.
 * - `nodes` (`{ id, label, isEgo }`) and `edges` (`{ id, from, to,
 *   attributes }`): the people and relationships of the pedigree, by their
 *   network ids. A membership list, because other stages could add people of
 *   the same type. `edgeIdVersion: 1` marked edge ids taken from the network;
 *   older records could hold the interface's own edge ids.
 * - `noChildrenAffirmed`: the participant said they have no children.
 * - `selectedFraming`: the framing the participant chose, when the stage let
 *   them choose.
 *
 * One schema 8 path wrote the record before the family reached the network:
 * ticking "no children" on the checklist while building rewrote the record,
 * marked as finalized, with the in-memory family's ids, and the pedigree then
 * counted as finalized without ever being written to the network. Such a
 * record is the only copy of that family: its relationships whole, its
 * people only by label and ego flag.
 *
 * WHAT SCHEMA 9 KEEPS. The redesigned pedigree writes each person and
 * relationship to the network as it is made and draws everyone connected to
 * the participant, so it needs no membership list. Its record holds only
 * `framing` (the participant's choice) and `generatedLabels`.
 *
 * THE TRANSLATION, which loses nothing the participant recorded:
 *
 * - `selectedFraming` becomes `framing`.
 * - A person or relationship in the record that is missing from the network
 *   is written to it, under the id the record gives (the network ids the
 *   protocol migration keeps: person type, name, ego, relationship type and
 *   kind are the same attributes in schema 9). A person gets the stage as
 *   their stage, the ego flag if they were the participant, and their label
 *   as their name. A relationship keeps all its attributes, including the
 *   kind, the current partner flag (schema 8's `isActive` attribute) and the
 *   gamete role, whose attribute schema 9 keeps in the codebook. A
 *   relationship already in the network between the same two people with the
 *   same kind is not written again, which also covers the older records
 *   whose edge ids were the interface's own.
 *
 * Then, for every converted pedigree, whether or not it left a record:
 *
 * - Every parent relationship of the pedigree's relationship type carries
 *   what the redesigned interface writes on one: no current partner flag,
 *   and the gestational carrier flag as true or false. Schema 8 wrote its
 *   `isActive` flag, which schema 9 reads as "current partner", as true on
 *   parent relationships too, and wrote the carrier flag only when true.
 *   Partner relationships keep the values recorded.
 * - A person with no sex at birth recorded who gave an egg or sperm, by the
 *   gamete role on a biological or donor relationship to their child, is
 *   recorded as female or male, as the redesigned interface records the egg
 *   and sperm parents it adds itself. Someone recorded as giving both, or
 *   with any sex at birth recorded, including "don't know", is left as they
 *   are.
 * - `noChildrenAffirmed` is recorded as "no children" on the participant's
 *   relatives-not-recorded attribute, which every converted stage has, when
 *   the participant has no children in the network.
 * - The membership list, `isNetworkCommitted` and `edgeIdVersion` are
 *   dropped, and a record left with nothing in it is removed.
 *
 * WHAT CANNOT BE CARRIED OVER, all of it confined to the one path above
 * where the family never reached the network:
 *
 * - A label the schema 8 interview made up for someone left unnamed ("Mother")
 *   cannot be told apart from a name the participant typed, so it is kept as
 *   their name rather than risk discarding a typed one.
 * - A label is not written into an encrypted name attribute, which only the
 *   interview can encrypt; that person stays unnamed.
 * - The stage's form answers, and a sex at birth the gamete role does not
 *   settle, were never stored outside the interview's memory; the redesigned
 *   stage asks for what it needs.
 * - "No children" is dropped where the participant has children.
 */
import { FAMILY_PEDIGREE_BUILD_PROMPT_ID } from './stages/family-pedigree.ts';

type Fields = Record<string, unknown>;

type SessionNetwork = {
  nodes: Fields[];
  edges: Fields[];
  ego: Fields;
};

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Fields => (isRecord(value) ? value : {});

const stringOrUndefined = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : undefined;

const SCHEMA_8_RECORD_KEYS = new Set([
  'isNetworkCommitted',
  'edgeIdVersion',
  'selectedFraming',
  'noChildrenAffirmed',
  'nodes',
  'edges',
]);

const FRAMINGS = new Set(['gamete', 'gendered']);

/** A record in the schema 8 shape: it has a key the schema 9 record lacks. */
const isSchema8Record = (entry: unknown): entry is Fields =>
  isRecord(entry) &&
  Object.keys(entry).some((key) => SCHEMA_8_RECORD_KEYS.has(key));

type PedigreeBindings = {
  stageId: string;
  personType: string;
  nameAttribute: string | undefined;
  nameEncrypted: boolean;
  egoAttribute: string;
  sexAttribute: string | undefined;
  edgeType: string;
  kindAttribute: string;
  gestationalCarrierAttribute: string | undefined;
  currentPartnerAttribute: string | undefined;
  /** Schema 8's gamete role attribute, which schema 9 no longer binds. */
  gameteRoleAttribute: string | undefined;
  relativesNotRecordedAttribute: string | undefined;
};

/**
 * `stage` is the converted pedigree; `schema8Stage` is the stage it was
 * converted from, which named the gamete role attribute.
 */
const bindingsOf = (
  stage: Fields,
  schema8Stage: Fields | undefined,
  codebook: unknown,
): PedigreeBindings | undefined => {
  const stageId = stringOrUndefined(stage.id);
  const personType = stringOrUndefined(asRecord(stage.subject).type);
  const node = asRecord(stage.nodeConfiguration);
  const edge = asRecord(stage.edgeConfiguration);
  const egoAttribute = stringOrUndefined(node.egoAttribute);
  const edgeType = stringOrUndefined(edge.type);
  const kindAttribute = stringOrUndefined(edge.kindAttribute);
  if (
    stageId === undefined ||
    personType === undefined ||
    egoAttribute === undefined ||
    edgeType === undefined ||
    kindAttribute === undefined
  ) {
    return undefined;
  }
  const nameAttribute = stringOrUndefined(node.nameAttribute);
  const nameVariable =
    nameAttribute === undefined
      ? undefined
      : asRecord(
          asRecord(
            asRecord(asRecord(asRecord(codebook).node)[personType]).variables,
          )[nameAttribute],
        );
  return {
    stageId,
    personType,
    nameAttribute,
    nameEncrypted: nameVariable?.encrypted === true,
    egoAttribute,
    sexAttribute: stringOrUndefined(node.sexAssignedAtBirthAttribute),
    edgeType,
    kindAttribute,
    gestationalCarrierAttribute: stringOrUndefined(
      edge.gestationalCarrierAttribute,
    ),
    currentPartnerAttribute: stringOrUndefined(edge.currentPartnerAttribute),
    gameteRoleAttribute: stringOrUndefined(
      asRecord(schema8Stage?.edgeConfig).gameteRoleVariable,
    ),
    relativesNotRecordedAttribute: stringOrUndefined(
      asRecord(stage.completeness).relativesNotRecordedAttribute,
    ),
  };
};

const attributesOf = (entity: Fields): Fields => asRecord(entity.attributes);

/** Categorical values are stored as arrays; the kind is the first value. */
const kindOf = (attributes: Fields, kindAttribute: string): unknown => {
  const value = attributes[kindAttribute];
  return Array.isArray(value) ? value[0] : value;
};

/** Leaves out the attribute values schema 8 stored as null. */
const definedAttributes = (attributes: unknown): Fields =>
  Object.fromEntries(
    Object.entries(asRecord(attributes)).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );

const findEgo = (network: SessionNetwork, bindings: PedigreeBindings) =>
  network.nodes.find(
    (node) =>
      node.type === bindings.personType &&
      attributesOf(node)[bindings.egoAttribute] === true,
  );

/**
 * Writes the people and relationships of a schema 8 record that are missing
 * from the network.
 */
const commitMissingFamily = (
  record: Fields,
  network: SessionNetwork,
  bindings: PedigreeBindings,
) => {
  const nodeIds = new Set(
    network.nodes.flatMap((node) =>
      typeof node._uid === 'string' ? [node._uid] : [],
    ),
  );
  // The network keeps one participant per pedigree: a record's own ego that
  // is missing stands for the one already there.
  const existingEgo = findEgo(network, bindings);
  const aliases = new Map<string, string>();

  for (const person of Array.isArray(record.nodes) ? record.nodes : []) {
    if (!isRecord(person) || typeof person.id !== 'string') continue;
    if (nodeIds.has(person.id)) continue;
    const isEgo = person.isEgo === true;
    if (isEgo && typeof existingEgo?._uid === 'string') {
      aliases.set(person.id, existingEgo._uid);
      continue;
    }
    const attributes: Fields = {};
    if (isEgo) attributes[bindings.egoAttribute] = true;
    const label =
      typeof person.label === 'string' ? person.label.trim() : undefined;
    if (
      label !== undefined &&
      label !== '' &&
      bindings.nameAttribute !== undefined &&
      !bindings.nameEncrypted
    ) {
      attributes[bindings.nameAttribute] = label;
    }
    network.nodes.push({
      _uid: person.id,
      type: bindings.personType,
      attributes,
      stageId: bindings.stageId,
      promptIDs: [FAMILY_PEDIGREE_BUILD_PROMPT_ID],
    });
    nodeIds.add(person.id);
  }

  const edgeIds = new Set(
    network.edges.flatMap((edge) =>
      typeof edge._uid === 'string' ? [edge._uid] : [],
    ),
  );
  const resolve = (id: unknown) =>
    typeof id === 'string' ? (aliases.get(id) ?? id) : undefined;

  for (const relationship of Array.isArray(record.edges) ? record.edges : []) {
    if (!isRecord(relationship) || typeof relationship.id !== 'string') {
      continue;
    }
    if (edgeIds.has(relationship.id)) continue;
    const from = resolve(relationship.from);
    const to = resolve(relationship.to);
    if (from === undefined || to === undefined) continue;
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    const attributes = definedAttributes(relationship.attributes);
    const kind = kindOf(attributes, bindings.kindAttribute);
    const recorded = network.edges.some(
      (edge) =>
        edge.type === bindings.edgeType &&
        ((edge.from === from && edge.to === to) ||
          (edge.from === to && edge.to === from)) &&
        kindOf(attributesOf(edge), bindings.kindAttribute) === kind,
    );
    if (recorded) continue;
    network.edges.push({
      _uid: relationship.id,
      type: bindings.edgeType,
      from,
      to,
      attributes,
    });
    edgeIds.add(relationship.id);
  }
};

/**
 * The kinds of parent relationship. Partner is the only other kind; a
 * relationship with no kind, or one schema 9 does not know, is not part of
 * the family the redesigned stage draws.
 */
const PARENT_KINDS = new Set([
  'biological',
  'adoptive',
  'social',
  'donor',
  'surrogate',
]);

/** Biological parents and gamete donors gave the child an egg or a sperm. */
const GENETIC_KINDS = new Set(['biological', 'donor']);

const familyEdges = (network: SessionNetwork, bindings: PedigreeBindings) =>
  network.edges.filter((edge) => edge.type === bindings.edgeType);

/**
 * Gives every parent relationship exactly what the redesigned interface
 * writes on one: the gestational carrier flag as true or false, and no
 * current partner flag. Schema 8 wrote its `isActive` flag, now the current
 * partner attribute, as true on parent relationships too. Partner
 * relationships keep what was recorded.
 */
const normalizeParentRelationships = (
  network: SessionNetwork,
  bindings: PedigreeBindings,
) => {
  const { currentPartnerAttribute, gestationalCarrierAttribute } = bindings;
  for (const edge of familyEdges(network, bindings)) {
    const attributes = attributesOf(edge);
    const kind = kindOf(attributes, bindings.kindAttribute);
    if (typeof kind !== 'string' || !PARENT_KINDS.has(kind)) continue;
    const next = { ...attributes };
    if (currentPartnerAttribute !== undefined) {
      delete next[currentPartnerAttribute];
    }
    if (gestationalCarrierAttribute !== undefined) {
      next[gestationalCarrierAttribute] =
        attributes[gestationalCarrierAttribute] === true;
    }
    edge.attributes = next;
  }
};

const SEX_FOR_GAMETE: Readonly<Record<string, string>> = {
  egg: 'female',
  sperm: 'male',
};

/**
 * Records the sex at birth of a person who has none recorded but gave an egg
 * or a sperm, by schema 8's gamete role on a genetic relationship to their
 * child: female for an egg, male for a sperm, as the redesigned interface
 * records the egg and sperm parents it adds itself. Someone recorded as
 * giving both is left unrecorded, and a recorded value is never replaced.
 */
const deriveSexFromGameteRole = (
  network: SessionNetwork,
  bindings: PedigreeBindings,
) => {
  const { sexAttribute, gameteRoleAttribute } = bindings;
  if (sexAttribute === undefined || gameteRoleAttribute === undefined) return;

  const sexesByPerson = new Map<unknown, Set<string>>();
  for (const edge of familyEdges(network, bindings)) {
    const attributes = attributesOf(edge);
    const kind = kindOf(attributes, bindings.kindAttribute);
    if (typeof kind !== 'string' || !GENETIC_KINDS.has(kind)) continue;
    const role = kindOf(attributes, gameteRoleAttribute);
    const sex = typeof role === 'string' ? SEX_FOR_GAMETE[role] : undefined;
    if (sex === undefined) continue;
    const sexes = sexesByPerson.get(edge.from) ?? new Set<string>();
    sexes.add(sex);
    sexesByPerson.set(edge.from, sexes);
  }

  for (const node of network.nodes) {
    if (node.type !== bindings.personType) continue;
    const sexes = sexesByPerson.get(node._uid);
    if (sexes?.size !== 1) continue;
    const attributes = attributesOf(node);
    const recorded = attributes[sexAttribute];
    const isRecorded =
      recorded !== undefined &&
      recorded !== null &&
      !(Array.isArray(recorded) && recorded.length === 0);
    if (isRecorded) continue;
    node.attributes = { ...attributes, [sexAttribute]: [...sexes] };
  }
};

const NO_CHILDREN = 'noChildren';

/** Records schema 8's "no children" answer on the participant. */
const recordNoChildren = (
  network: SessionNetwork,
  bindings: PedigreeBindings,
) => {
  const attribute = bindings.relativesNotRecordedAttribute;
  if (attribute === undefined) return;
  const ego = findEgo(network, bindings);
  if (!ego) return;
  const hasChildren = network.edges.some(
    (edge) =>
      edge.type === bindings.edgeType &&
      edge.from === ego._uid &&
      kindOf(attributesOf(edge), bindings.kindAttribute) !== 'partner',
  );
  if (hasChildren) return;
  const attributes = attributesOf(ego);
  const current = attributes[attribute];
  if (current === undefined || current === null) {
    ego.attributes = { ...attributes, [attribute]: [NO_CHILDREN] };
    return;
  }
  if (Array.isArray(current) && !current.includes(NO_CHILDREN)) {
    ego.attributes = { ...attributes, [attribute]: [...current, NO_CHILDREN] };
  }
};

const schema8StageById = (protocol: unknown, id: unknown) => {
  const stages = asRecord(protocol).stages;
  if (!Array.isArray(stages)) return undefined;
  const stage: unknown = stages.find(
    (candidate: unknown) =>
      isRecord(candidate) &&
      candidate.type === 'FamilyPedigree' &&
      candidate.id === id,
  );
  return isRecord(stage) ? stage : undefined;
};

/**
 * Translates every schema 8 Family Pedigree record in a session whose stage
 * records already sit at their schema 9 indices, and brings the family each
 * converted pedigree draws into the shape the redesigned interface writes.
 * `protocol` is the migrated, schema 9 document and `schema8Protocol` the
 * document it was migrated from. Records of every other stage, and pedigree
 * records already in the schema 9 shape, are left as they are.
 */
export const migrateFamilyPedigreeSessionRecords = (
  session: { network: SessionNetwork; stageMetadata: Fields },
  protocol: unknown,
  schema8Protocol: unknown,
) => {
  const stages = asRecord(protocol).stages;
  if (!Array.isArray(stages)) return;
  const { codebook } = asRecord(protocol);

  stages.forEach((stage: unknown, index) => {
    if (!isRecord(stage) || stage.type !== 'FamilyPedigree') return;
    const key = String(index);
    const record = session.stageMetadata[key];
    const bindings = bindingsOf(
      stage,
      schema8StageById(schema8Protocol, stage.id),
      codebook,
    );
    const schema8Record = isSchema8Record(record) ? record : undefined;

    if (bindings) {
      if (schema8Record) {
        commitMissingFamily(schema8Record, session.network, bindings);
      }
      normalizeParentRelationships(session.network, bindings);
      deriveSexFromGameteRole(session.network, bindings);
      if (schema8Record?.noChildrenAffirmed === true) {
        recordNoChildren(session.network, bindings);
      }
    }
    if (!schema8Record) return;

    const framing =
      typeof schema8Record.selectedFraming === 'string' &&
      FRAMINGS.has(schema8Record.selectedFraming)
        ? schema8Record.selectedFraming
        : undefined;
    if (framing === undefined) {
      delete session.stageMetadata[key];
    } else {
      session.stageMetadata[key] = { framing };
    }
  });
};
