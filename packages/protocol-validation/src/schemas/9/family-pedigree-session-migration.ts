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
 *   same kind is not written again, which also covers the older records whose
 *   edge ids were the interface's own.
 * - `noChildrenAffirmed` is recorded as "no children" on the participant's
 *   relatives-not-recorded attribute, when the converted stage has one and
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
 * - Sex at birth and the stage's form answers were never stored outside the
 *   interview's memory; the redesigned stage asks for what it needs.
 * - "No children" is dropped where the converted stage has no attribute to
 *   record it in (no completeness setting) or the participant has children.
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
  edgeType: string;
  kindAttribute: string;
  relativesNotRecordedAttribute: string | undefined;
};

const bindingsOf = (
  stage: Fields,
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
    edgeType,
    kindAttribute,
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

/**
 * Translates every schema 8 Family Pedigree record in a session whose stage
 * records already sit at their schema 9 indices. `protocol` is the migrated,
 * schema 9 document. Records of every other stage, and pedigree records
 * already in the schema 9 shape, are left as they are.
 */
export const migrateFamilyPedigreeSessionRecords = (
  session: { network: SessionNetwork; stageMetadata: Fields },
  protocol: unknown,
) => {
  const stages = asRecord(protocol).stages;
  if (!Array.isArray(stages)) return;
  const { codebook } = asRecord(protocol);

  stages.forEach((stage: unknown, index) => {
    if (!isRecord(stage) || stage.type !== 'FamilyPedigree') return;
    const key = String(index);
    const record = session.stageMetadata[key];
    if (!isSchema8Record(record)) return;

    const bindings = bindingsOf(stage, codebook);
    if (bindings) {
      commitMissingFamily(record, session.network, bindings);
      if (record.noChildrenAffirmed === true) {
        recordNoChildren(session.network, bindings);
      }
    }

    const framing =
      typeof record.selectedFraming === 'string' &&
      FRAMINGS.has(record.selectedFraming)
        ? record.selectedFraming
        : undefined;
    if (framing === undefined) {
      delete session.stageMetadata[key];
    } else {
      session.stageMetadata[key] = { framing };
    }
  });
};
