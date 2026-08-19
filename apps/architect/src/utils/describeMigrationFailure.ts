import { normalizeForComparison } from '@codaco/shared-consts';

/**
 * Turns a thrown migration failure into something a researcher can act on.
 *
 * `migrateProtocol` re-validates its output and throws when the result does not
 * satisfy the current schema. Architect surfaced that as a bare "Protocol
 * migration failed.", which tells the researcher nothing about their file and
 * offers no way forward — their instrument simply will not open.
 *
 * The case worth naming specifically is the duplicate attribute name. Schema 8
 * compares codebook names case-insensitively and in Unicode canonical form, so
 * a protocol authored under an older Architect may legitimately hold `name` and
 * `NAME` on one entity: two distinct variables, each with its own collected
 * data and its own export column. That is why this is reported rather than
 * repaired — which of the pair keeps the name changes an export header for data
 * already gathered, and only the researcher can make that call.
 *
 * DELIBERATELY NOT A REPAIR. Renaming automatically is technically safe
 * (everything references variables by id), but it would silently rewrite a
 * column heading in data already collected. The researcher is told exactly what
 * collides and where, and fixes it in the version of Architect that wrote it.
 */

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DUPLICATE_NAME = /Duplicate attribute name "([^"]+)"/;

/**
 * Every stored spelling on `owner` that collides with `name` under the schema's
 * comparison, in codebook order. Returns the researcher's own spellings, not
 * the folded key — naming the fold would describe a string they never typed.
 */
const collidingNames = (owner: unknown, name: string): string[] => {
  const variables = isRecord(owner) ? owner.variables : undefined;
  if (!isRecord(variables)) return [];

  const target = normalizeForComparison(name);
  const found: string[] = [];
  for (const variable of Object.values(variables)) {
    const candidate = isRecord(variable) ? variable.name : undefined;
    if (typeof candidate !== 'string') continue;
    if (normalizeForComparison(candidate) === target) found.push(candidate);
  }
  return found;
};

/** Where in the codebook a colliding pair lives, phrased for a researcher. */
const locateCollision = (
  protocol: unknown,
  name: string,
): { where: string; spellings: string[] } | undefined => {
  const codebook = isRecord(protocol) ? protocol.codebook : undefined;
  if (!isRecord(codebook)) return undefined;

  const ego = collidingNames(codebook.ego, name);
  if (ego.length > 1) return { where: 'the interviewee', spellings: ego };

  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (!isRecord(types)) continue;
    for (const type of Object.values(types)) {
      const spellings = collidingNames(type, name);
      if (spellings.length > 1) {
        const label =
          isRecord(type) && typeof type.name === 'string' ? type.name : entity;
        return { where: `"${label}"`, spellings };
      }
    }
  }
  return undefined;
};

/**
 * A researcher-facing title and message for a migration that threw.
 *
 * Falls back to the underlying reason rather than a generic sentence: even an
 * unrecognised failure is more actionable when it says what the check objected
 * to.
 */
export const describeMigrationFailure = (
  error: Error,
  protocol: unknown,
): { title: string; message: string } => {
  const duplicate = DUPLICATE_NAME.exec(error.message);

  if (duplicate?.[1]) {
    const name = duplicate[1];
    const collision = locateCollision(protocol, name);
    const pair = collision?.spellings.map((s) => `"${s}"`).join(' and ');

    return {
      title: 'Two attributes share a name',
      message: collision
        ? `${pair} on ${collision.where} count as the same name, because names are compared without regard to capitalisation or accents. They were allowed when this protocol was made, but they cannot both exist now — a researcher reading a dropdown could not tell them apart. Open this protocol in the version of Architect that created it, rename one of them, then open it here again.`
        : `Two attributes named "${name}" count as the same name, because names are compared without regard to capitalisation or accents. Open this protocol in the version of Architect that created it, rename one of them, then open it here again.`,
    };
  }

  return {
    title: 'Failed to Open Protocol',
    message: `This protocol could not be brought up to date. ${error.message}`,
  };
};
