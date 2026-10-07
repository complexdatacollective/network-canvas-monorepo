import { z } from 'zod';

const STAGE_REFERENCE = 'stageReference' as const;

/**
 * Every site declared so far, in declaration order and deduplicated by the
 * path each one names.
 *
 * A module-level registry rather than a walk of the schemas, for the reason
 * `declared-variants.ts` keeps one: the declaration IS the tag call, so a site
 * cannot be tagged and left out of the inventory, and the inventory needs no
 * second reader of the schema tree that could disagree with the collector's.
 */
const SITES = new Set<string>();

/**
 * A string field holding another STAGE's id: a skip-logic destination, the
 * FamilyPedigree a NarrativePedigree describes the people of.
 *
 * Tagging the schema node — rather than hand-maintaining a list of paths in
 * each consumer — is what lets `collectStageReferences` discover every stage a
 * protocol depends on, including the ones a stage type added after the
 * consumer was written. It is the stage counterpart of
 * `entityAttributeReference`, `entityTypeReference` and `assetReference`.
 *
 * `site` is the path of this field inside a STAGE document, spelled with `*`
 * for a list this path runs through. It is what a consumer enumerating the
 * declared kinds is handed, so it has to name where the tag sits: a tagged
 * schema reused at a second path declares one site and needs a second call.
 *
 * The tag answers "which stages does this stage name?" and nothing more.
 * Whether the named stage exists, and whether it is of the right TYPE for the
 * site (a NarrativePedigree's source must be a FamilyPedigree) or in the right
 * position (a skip destination must come after the stage jumping to it), is
 * still decided by the protocol-level refinements in `schema.ts`.
 */
export const stageReference = (site: string) => {
  SITES.add(site);
  return z.string().meta({ [STAGE_REFERENCE]: site });
};

/** The site this schema node declares, or undefined when it declares none. */
export const getStageReferenceSite = (
  schema: z.ZodType,
): string | undefined => {
  const site = schema.meta()?.[STAGE_REFERENCE];
  return typeof site === 'string' ? site : undefined;
};

/**
 * The sites tagged by whatever schema modules have been loaded. Read it
 * through `declaredStageReferenceSites`, which loads the current schema first.
 */
export const registeredStageReferenceSites = (): string[] => [...SITES];
