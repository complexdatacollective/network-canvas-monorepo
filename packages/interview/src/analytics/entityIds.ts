import { v4 as uuid } from 'uuid';

/**
 * Entity identifiers reported to analytics are session-scoped pseudonyms, never
 * the interview's own `_uid`s.
 *
 * The analytics design admits `node_id`/`edge_id` on the stated premise that
 * they are "random UUIDs generated at creation time, no derivation from
 * participant input" (`docs/superpowers/specs/2026-05-05-interview-analytics-design.md`
 * §8). Roster nodes break that premise: `makeVariableUUIDReplacer` keys an
 * external-data row as `${subjectType}_${hash({ node, index })}`, a
 * deterministic, unkeyed digest of the row's own content, and
 * `NameGeneratorRoster` adds the node under exactly that key. A raw `_uid`
 * therefore names a specific roster row to anyone holding the roster — the
 * digest is recomputable, so a known roster is enumerable — and the same row
 * carries the same identifier in every interview, linking a person's events
 * across sessions.
 *
 * Each session mints its own random pseudonym per entity, held only in memory
 * and never persisted or transmitted. Events within one session still join on
 * the entity — which is all the taxonomy asks of these properties ("per-entity
 * behavioural reconstruction", and `distinct_id` is already the session id, so
 * every interview is its own PostHog person) — while nothing joins across
 * sessions or back to a roster row.
 *
 * Deliberately not a keyed hash of the `_uid`: a stored key buys no analytic
 * capability over a random map and adds key management to a runtime whose whole
 * privacy posture is that nothing identifying is kept.
 */
export type EntityIdPseudonymiser = (id: string) => string;

/**
 * The event properties that carry an entity's primary key. An explicit
 * allowlist rather than a `*_id` pattern: `installation_id` and `distinct_id`
 * are deliberately stable identifiers and must pass through untouched.
 */
const ENTITY_ID_PROPS = [
  'node_id',
  'edge_id',
  'node_a_id',
  'node_b_id',
  'entity_id',
] as const;

export function createEntityIdPseudonymiser(): EntityIdPseudonymiser {
  const pseudonyms = new Map<string, string>();

  return (id) => {
    const existing = pseudonyms.get(id);
    if (existing !== undefined) return existing;
    const pseudonym = uuid();
    pseudonyms.set(id, pseudonym);
    return pseudonym;
  };
}

/**
 * Replace every entity id in an event's properties with its session pseudonym.
 * Applied at the tracker boundary so no emitter — listener middleware or hook —
 * can reintroduce a raw `_uid` by adding an event.
 */
export function pseudonymiseEntityIds(
  props: Record<string, unknown> | undefined,
  pseudonymise: EntityIdPseudonymiser,
): Record<string, unknown> | undefined {
  if (!props) return props;

  let next: Record<string, unknown> | undefined;

  for (const key of ENTITY_ID_PROPS) {
    const value = props[key];
    // Non-strings are ids the emitter omitted (the taxonomy makes several
    // optional); there is nothing to pseudonymise and nothing to leak.
    if (typeof value !== 'string') continue;
    next ??= { ...props };
    next[key] = pseudonymise(value);
  }

  return next ?? props;
}
