// Retry message for step 2 and the request body for step 3 (Wording).
import type { ProtocolValidationIssue } from '@codaco/protocol-validation';

import type { NormalizedDesign } from './analyse.ts';
import type { StageSource } from './compile.ts';
import { taskIntroductions } from './intros.ts';
import type { DesignIssue } from './rules.ts';

const describeStage = (src: StageSource | undefined) =>
  !src
    ? 'an unknown stage'
    : 'added' in src
      ? `the ${src.added} stage Sketch added`
      : `stages[${src.designIndex}] (id "${src.designId}", ${src.kind})`;

/** Map a protocol-validation path onto the design: stages.N via stageMap, codebook.* via the longest sourceMap prefix. */
const locate = (
  path: (string | number)[],
  stageMap: StageSource[],
  sourceMap: Map<string, string>,
) => {
  if (path[0] === 'stages' && typeof path[1] === 'number')
    return `${describeStage(stageMap[path[1]])}, compiled ${path.slice(2).join('.') || '(stage)'}`;
  for (let n = path.length; n > 0; n--) {
    const hit = sourceMap.get(path.slice(0, n).join('.'));
    if (hit) return hit;
  }
  return 'the protocol as a whole';
};

export const formatRetryFeedback = (
  designIssues: DesignIssue[],
  validationIssues: readonly ProtocolValidationIssue[],
  stageMap: StageSource[],
  sourceMap: Map<string, string>,
): string => {
  const lines = [
    'Sketch could not build your design exactly as written. Return the COMPLETE corrected StudyDesign.',
    'Fix only the problems listed. Keep every id, stage, prompt and attribute that is not mentioned exactly as it was, in the same order.',
    'Ids are references: if you rename one, rename every reference to it. Do not invent attributes a stage does not need.',
  ];
  const problems = designIssues.filter((i) => i.severity === 'degraded');
  if (problems.length) {
    lines.push('', 'Design problems (paths refer to your design JSON):');
    problems.forEach((i) =>
      lines.push(`- [${i.code}] ${i.path}: ${i.message}`),
    );
  }
  if (validationIssues.length) {
    lines.push(
      '',
      'Schema 9 validation problems in the protocol compiled from your design:',
    );
    const seen = new Set<string>();
    let shown = 0;
    for (const v of validationIssues) {
      const where = locate(v.path, stageMap, sourceMap);
      const k = `${where}|${v.message}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (shown++ === 15) {
        lines.push(
          `- …and ${validationIssues.length - 15} more of the same kinds.`,
        );
        break;
      }
      lines.push(`- [SCHEMA] ${where}: ${v.message}`);
    }
  }
  const fixed = designIssues.filter((i) => i.severity === 'adjusted').length;
  if (fixed)
    lines.push(
      '',
      `(${fixed} smaller issues were corrected automatically; you do not need to address them.)`,
    );
  return lines.join('\n');
};

/** What step 3 is asked to word. Each slot says what `title` and `text` mean for that stage. */
export const buildWordingRequest = (d: NormalizedDesign) => {
  const stages: {
    stageKey: string;
    kind: string;
    purpose: string;
    title: string;
    text: string;
    draft: string;
  }[] = [];
  const prompts: {
    promptKey: string;
    draft: string;
    needsNegativeLabel: boolean;
    kind: string;
  }[] = [];
  const questions: { questionKey: string; draft: string }[] = [];
  const instruments = new Set(d.instrumentAttributes);
  const seenQ = new Set<string>();
  const q = (scope: string, id: string, draft: string) => {
    const questionKey = scope === 'ego' ? `ego/${id}` : `${scope}/${id}`;
    if (instruments.has(`${scope}/${id}`) || !draft || seenQ.has(questionKey))
      return;
    seenQ.add(questionKey);
    questions.push({ questionKey, draft });
  };
  const attr = (scope: string, id: string) =>
    (scope === 'ego'
      ? d.egoAttributes
      : scope.startsWith('node:')
        ? d.nodeTypes.find((n) => `node:${n.id}` === scope)!.attributes
        : d.relationships.find((r) => `rel:${r.id}` === scope)!.attributes
    ).find((a) => a.id === id)!;
  if (d.includeConsent) {
    stages.push({
      stageKey: 'consent',
      kind: 'consent',
      purpose: 'Consent to take part',
      title: 'introduction title',
      text: 'introduction text: what taking part involves',
      draft: d.consentText,
    });
    questions.push({
      questionKey: 'consent',
      draft: 'Do you agree to take part in this study?',
    });
  }
  const intros = taskIntroductions(d);
  for (const s of d.stages) {
    const slot = (title: string, text: string, draft = '') =>
      stages.push({
        stageKey: s.id,
        kind: s.kind,
        purpose: s.purpose,
        title,
        text,
        draft,
      });
    const intro = intros.get(s.id);
    if (intro)
      stages.push({
        stageKey: `${s.id}/intro`,
        kind: `introduction to ${s.kind}`,
        purpose: s.purpose,
        title: `introduction screen title; draft: "${intro.title}"`,
        text: 'introduction screen text: what the next screen asks the participant to do, and how',
        draft: intro.text,
      });
    switch (s.kind) {
      case 'information':
        slot('screen title', 'screen body (Markdown)', s.content);
        break;
      case 'egoForm':
        slot('introduction title', 'introduction text');
        s.attributeIds.forEach((a) => q('ego', a, attr('ego', a).question));
        break;
      // Schema 9 gives only an Ego Form an introduction panel.
      case 'alterForm':
        slot('none: return ""', 'none: return ""');
        s.attributeIds.forEach((a) =>
          q(
            `node:${s.nodeTypeId}`,
            a,
            attr(`node:${s.nodeTypeId}`, a).question,
          ),
        );
        break;
      case 'relationshipForm':
        slot('none: return ""', 'none: return ""');
        s.attributeIds.forEach((a) =>
          q(
            `rel:${s.relationshipId}`,
            a,
            attr(`rel:${s.relationshipId}`, a).question,
          ),
        );
        break;
      case 'nameGenerator':
        if (s.method === 'form') {
          slot('form title, e.g. "Add a friend"', 'none: return ""');
          q(
            `node:${s.nodeTypeId}`,
            'name',
            d.nodeTypes.find((n) => n.id === s.nodeTypeId)!.nameQuestion,
          );
          s.attributeIds.forEach((a) =>
            q(
              `node:${s.nodeTypeId}`,
              a,
              attr(`node:${s.nodeTypeId}`, a).question,
            ),
          );
        } else slot('none: return ""', 'none: return ""');
        break;
      case 'networkComposer':
        slot('none: return ""', 'none: return ""');
        s.attributeIds.forEach((a) =>
          q(
            `node:${s.nodeTypeId}`,
            a,
            attr(`node:${s.nodeTypeId}`, a).question,
          ),
        );
        s.relationships.forEach((e) =>
          e.attributeIds.forEach((a) =>
            q(
              `rel:${e.relationshipId}`,
              a,
              attr(`rel:${e.relationshipId}`, a).question,
            ),
          ),
        );
        break;
      default:
        slot('none: return ""', 'none: return ""');
    }
    if ('prompts' in s)
      s.prompts.forEach((p, i) =>
        prompts.push({
          promptKey: `${s.id}/p${i + 1}`,
          draft: p.text,
          kind: s.kind,
          needsNegativeLabel:
            s.kind === 'relationshipCensus' && s.method === 'with_strength',
        }),
      );
    if (s.kind === 'narrative')
      s.views.forEach((v, i) =>
        prompts.push({
          promptKey: `${s.id}/view${i + 1}`,
          draft: v.label,
          kind: 'narrative view label (1-4 words)',
          needsNegativeLabel: false,
        }),
      );
  }
  return { summary: d.summary, stages, prompts, questions };
};
