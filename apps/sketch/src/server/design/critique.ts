// The design review (step 2, second call): a critic reads the chosen design
// and returns its findings plus edits to the design. Code applies the edits;
// the critic never restates the design, so the call stays short.
//
// The same provider rules as schema.ts apply (every key required, one union).
// The only union is StageSchema, used once, in `stages`.
import { z } from 'zod';

import {
  AttributeSchema,
  EndingSchema,
  RelationshipSchema,
  StageSchema,
  type DesignAttribute,
  type DesignStage,
  type StudyDesign,
} from './schema.ts';

const Text = (what: string) => z.string().describe(what);

export const CRITIQUE_SEVERITIES = ['critical', 'major', 'minor'] as const;

const IssueSchema = z.object({
  stageId: Text(
    'The design stage the issue concerns, or "study" for the design as a whole.',
  ),
  severity: z
    .enum(CRITIQUE_SEVERITIES)
    .describe(
      'critical = the data cannot answer a research question, the interview breaks, or participants could be harmed. major = validity, burden or participant experience is substantially worse than it needs to be. minor = a clear improvement that matters less.',
    ),
  problem: Text(
    'The problem and the evidence for it, in one or two sentences.',
  ),
  change: Text(
    'What your edits change to fix it, in one sentence. "" when you leave it for the researcher to decide, and then say what they should decide in problem.',
  ),
});

const OWNERS = ['participant', 'node', 'relationship'] as const;

export const CritiqueSchema = z.object({
  issues: z
    .array(IssueSchema)
    .describe(
      'Every real problem you found, most serious first. [] if there are none.',
    ),
  verdict: Text(
    'Two or three sentences for the researcher: whether the design answers the research questions, and the most important change.',
  ),
  stages: z
    .array(
      z.object({
        action: z
          .enum(['replace', 'add'])
          .describe(
            'replace = the stage with the same id is replaced by this complete stage, in place. add = a new stage, inserted after afterStageId.',
          ),
        afterStageId: Text(
          'add: the id of the design stage this one follows, or "" to put it first. replace: "".',
        ),
        stage: StageSchema,
      }),
    )
    .describe(
      'Stages you change or add, each complete. Never restate a stage you leave unchanged.',
    ),
  removeStageIds: z
    .array(z.string())
    .describe('Ids of design stages to remove. Usually [].'),
  attributes: z
    .array(
      z.object({
        owner: z
          .enum(OWNERS)
          .describe(
            'participant = egoAttributes; node = an attribute of node type ownerId; relationship = an attribute of relationship ownerId.',
          ),
        ownerId: Text(
          'The node type or relationship id; "" for participant attributes.',
        ),
        attribute: AttributeSchema,
      }),
    )
    .describe(
      'Attributes you add or change, each complete. One with the id of an existing attribute of the same owner replaces it.',
    ),
  removeAttributes: z
    .array(
      z.object({
        owner: z.enum(OWNERS),
        ownerId: Text('As in attributes.'),
        attributeId: Text('The attribute to remove.'),
      }),
    )
    .describe(
      'Attributes to remove. Remove every use of them too (stages, filters, skip logic). Usually [].',
    ),
  relationships: z
    .array(RelationshipSchema)
    .describe(
      'Relationship types you add, or replace by id (with all their attributes). Usually [].',
    ),
  endings: z
    .array(EndingSchema)
    .describe(
      'Early endings you add, or replace by id. A stage they list must end the interview (whenSkipped end_interview). Usually [].',
    ),
  consentText: Text(
    'A complete replacement for consentText, or "" to leave it unchanged.',
  ),
  rationaleNote: Text(
    'One or two sentences added to the rationale about what the review changed, or "".',
  ),
});

export type Critique = z.infer<typeof CritiqueSchema>;
export type CritiqueIssue = Critique['issues'][number];

type Owner = (typeof OWNERS)[number];

// One edit, applied on its own: a name for the log and a pure transform.
export type CritiqueEdit = {
  describe: string;
  apply: (design: StudyDesign) => StudyDesign;
};

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];

const withAttributes = (
  design: StudyDesign,
  owner: Owner,
  ownerId: string,
  change: (attributes: DesignAttribute[]) => DesignAttribute[],
): StudyDesign => {
  if (owner === 'participant')
    return { ...design, egoAttributes: change(design.egoAttributes) };
  if (owner === 'node')
    return {
      ...design,
      nodeTypes: design.nodeTypes.map((n) =>
        n.id === ownerId ? { ...n, attributes: change(n.attributes) } : n,
      ),
    };
  return {
    ...design,
    relationships: design.relationships.map((r) =>
      r.id === ownerId ? { ...r, attributes: change(r.attributes) } : r,
    ),
  };
};

const insertAfter = (
  stages: DesignStage[],
  afterId: string,
  stage: DesignStage,
): DesignStage[] => {
  if (!afterId) return [stage, ...stages];
  const at = stages.findIndex((s) => s.id === afterId);
  // An unknown anchor puts the stage before the closing screens.
  if (at === -1) {
    const closing = stages.findIndex(
      (s) => s.kind === 'information' && s.role === 'closing',
    );
    return closing === -1
      ? [...stages, stage]
      : [...stages.slice(0, closing), stage, ...stages.slice(closing)];
  }
  return [...stages.slice(0, at + 1), stage, ...stages.slice(at + 1)];
};

/**
 * The critique's edits in the order they are applied: entities first, so a
 * stage can use an attribute the same critique adds.
 */
export const critiqueEdits = (critique: Critique): CritiqueEdit[] => [
  ...critique.relationships.map((r) => ({
    describe: `relationship "${r.id}"`,
    apply: (d: StudyDesign) => ({
      ...d,
      relationships: upsert(d.relationships, r),
    }),
  })),
  ...critique.endings.map((e) => ({
    describe: `ending "${e.id}"`,
    apply: (d: StudyDesign) => ({ ...d, endings: upsert(d.endings, e) }),
  })),
  ...critique.attributes.map((a) => ({
    describe: `attribute "${a.attribute.id}"`,
    apply: (d: StudyDesign) =>
      withAttributes(d, a.owner, a.ownerId, (list) =>
        upsert(list, a.attribute),
      ),
  })),
  ...critique.removeStageIds.map((id) => ({
    describe: `removing stage "${id}"`,
    apply: (d: StudyDesign) => ({
      ...d,
      stages: d.stages.filter((s) => s.id !== id),
    }),
  })),
  ...critique.stages.map((s) => ({
    describe:
      s.action === 'replace'
        ? `stage "${s.stage.id}"`
        : `new stage "${s.stage.id}"`,
    apply: (d: StudyDesign) =>
      s.action === 'replace' && d.stages.some((x) => x.id === s.stage.id)
        ? {
            ...d,
            stages: d.stages.map((x) => (x.id === s.stage.id ? s.stage : x)),
          }
        : {
            ...d,
            stages: insertAfter(
              d.stages.filter((x) => x.id !== s.stage.id),
              s.afterStageId,
              s.stage,
            ),
          },
  })),
  ...critique.removeAttributes.map((a) => ({
    describe: `removing attribute "${a.attributeId}"`,
    apply: (d: StudyDesign) =>
      withAttributes(d, a.owner, a.ownerId, (list) =>
        list.filter((x) => x.id !== a.attributeId),
      ),
  })),
  ...(critique.consentText.trim()
    ? [
        {
          describe: 'consent text',
          apply: (d: StudyDesign) => ({
            ...d,
            consentText: critique.consentText,
          }),
        },
      ]
    : []),
  ...(critique.rationaleNote.trim()
    ? [
        {
          describe: 'rationale',
          apply: (d: StudyDesign) => ({
            ...d,
            rationale: `${d.rationale} ${critique.rationaleNote}`.trim(),
          }),
        },
      ]
    : []),
];

/**
 * Applies the edits, all at once when the result is acceptable, otherwise
 * one by one, keeping each that leaves the design acceptable. `acceptable`
 * is the caller's check, usually a preflight build.
 */
export const applyCritique = async (
  design: StudyDesign,
  edits: CritiqueEdit[],
  acceptable: (design: StudyDesign) => Promise<boolean>,
): Promise<{ design: StudyDesign; applied: string[]; skipped: string[] }> => {
  if (!edits.length) return { design, applied: [], skipped: [] };
  const all = edits.reduce((d, e) => e.apply(d), design);
  if (await acceptable(all))
    return { design: all, applied: edits.map((e) => e.describe), skipped: [] };
  let current = design;
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const edit of edits) {
    const next = edit.apply(current);
    if (await acceptable(next)) {
      current = next;
      applied.push(edit.describe);
    } else skipped.push(edit.describe);
  }
  return { design: current, applied, skipped };
};
