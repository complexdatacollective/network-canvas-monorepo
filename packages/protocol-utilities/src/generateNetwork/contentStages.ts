import type { Stage } from '@codaco/protocol-validation';

import type { StageOfType } from './context.ts';

/**
 * The stage types `generateNetwork`'s dispatch deliberately runs no handler
 * for. A content stage presents what other stages collected — an Information
 * screen, an Anonymisation notice, a Narrative's canvas, a NarrativePedigree
 * reading the network its source FamilyPedigree wrote — so it creates no
 * entity and writes no attribute onto one.
 *
 * This list is the dispatch's own record of that decision rather than a second
 * opinion about it: `generateNetwork` narrows these stages away before its
 * switch, so the switch covers exactly the types that do something. The two
 * accounts therefore cannot drift. Giving a listed type a handler stops
 * type-checking as a `case`, since the narrowed stage can never carry that
 * type; dropping a type from the list sends it into the switch, where it has no
 * case and is refused as unsupported — which the schema-derived stage-type
 * coverage test catches, exactly as it catches a new stage type nobody has
 * taught the generator about yet.
 *
 * `analyseFeasibility` reads the same list, which is the point of its living
 * next to the dispatch. A protocol's stages name their node and edge types
 * through the schema's `entityTypeReference` tags whether or not the naming
 * stage does anything, so the tags alone read a Narrative's subject as evidence
 * that the type carries generated values. Feasibility asks this list instead,
 * and only for the reference sites a content stage owns: everything else — an
 * unrecognised stage type included — is read as a writer, which is the
 * direction that leaves a refusal standing rather than letting an invalid value
 * through.
 */
export const CONTENT_STAGE_TYPES = [
  'Information',
  'Anonymisation',
  'Narrative',
  'NarrativePedigree',
] as const satisfies readonly Stage['type'][];

type ContentStageType = (typeof CONTENT_STAGE_TYPES)[number];

const contentStageTypes: ReadonlySet<string> = new Set<string>(
  CONTENT_STAGE_TYPES,
);

export function isContentStage(
  stage: Stage,
): stage is StageOfType<ContentStageType> {
  return contentStageTypes.has(stage.type);
}
