// Task introductions: Sketch puts an Information screen before the first
// stage of each kind of task, so the participant learns how a task works
// before doing it. Schema 9 dropped the introduction panels that used to do
// this on the stage itself (only an Ego Form keeps one).
//
// A task counts as introduced only once a stage that surely shows has
// introduced it: a stage that can be skipped (by its own skip logic, by the
// compiler's skip when no one of its type or no tie exists, or by the
// interview when its filter leaves no one) may leave the participant to
// meet the task first at a later stage. The screen takes the stage's skip
// logic in compile(), so it never shows without its task (bar a filter that
// leaves no one, which skip logic cannot express).

import type { NormalizedDesign, NStage } from './analyse.ts';

export type TaskIntroduction = { title: string; text: string };

const lower = (s: string) => s.toLowerCase();

/** The kinds of task a stage asks the participant to do; [] for none. */
const tasksOf = (s: NStage): string[] => {
  switch (s.kind) {
    case 'nameGenerator':
    case 'relationshipCensus':
      return [`${s.kind}:${s.method}`];
    case 'sociogram':
      return [...new Set(s.prompts.map((p) => `sociogram:${p.task}`))];
    case 'alterForm':
    case 'relationshipForm':
    case 'bins':
    case 'networkComposer':
    case 'geospatial':
      return [s.kind];
    // a text screen, an Ego Form (which keeps its own introduction) and a
    // narrative (a view for the interviewer to discuss) set no new task
    case 'information':
    case 'egoForm':
    case 'narrative':
      return [];
    default: {
      const unhandled: never = s;
      throw new Error('Unhandled stage kind', { cause: unhandled });
    }
  }
};

const SOCIOGRAM_STEPS: Record<
  string,
  (plural: string, singular: string) => string
> = {
  'sociogram:position': (p) =>
    `Drag each of the ${p} onto the circles. The closer to the centre you place someone, the closer they are to you.`,
  'sociogram:connect': (p) =>
    `To connect two of the ${p}, tap one and then the other. Do the same again to remove a connection.`,
  'sociogram:highlight': (_, s) =>
    `Tap each ${s} the question describes. Tap them again to undo.`,
};

const draft = (
  d: NormalizedDesign,
  s: NStage,
  fresh: string[],
): TaskIntroduction => {
  const nt =
    'nodeTypeId' in s
      ? d.nodeTypes.find((n) => n.id === s.nodeTypeId)
      : undefined;
  const plural = lower(nt?.plural ?? 'people');
  const singular = lower(nt?.singular ?? 'person');
  switch (s.kind) {
    case 'nameGenerator':
      return {
        title: `Naming ${plural}`,
        text:
          s.method === 'roster'
            ? `On the next screen you will see a list of ${plural}. Find everyone the question describes, using the search if it helps, and drag each one into the panel of people you have added.`
            : s.method === 'form'
              ? `On the next screen you will be asked a question. For each ${singular} who comes to mind, tap the add button, answer a few short questions about them, and save. Move on when you have added everyone.`
              : `On the next screen you will be asked a question. Tap the add button, then type the name of each ${singular} who comes to mind and press Enter. Move on when you have added everyone.`,
      };
    case 'alterForm':
      return {
        title: `About the ${plural} you named`,
        text: `Next, you will answer a few questions about each of the ${plural} you named, one at a time.`,
      };
    case 'relationshipForm': {
      const r = d.relationships.find((x) => x.id === s.relationshipId);
      return {
        title: 'About these relationships',
        text: `Next, you will answer a few questions about each "${lower(r?.name ?? 'relationship')}" relationship you described, one at a time.`,
      };
    }
    case 'bins':
      return {
        title: `Sorting the ${plural} you named`,
        text: `On the next screen you will see the ${plural} you named and a set of boxes. Drag each ${singular} into the box that describes them best.`,
      };
    case 'sociogram':
      return {
        title: 'Your network map',
        text: [
          `On the next screen you will see the ${plural} you named on a map, with you at the centre.`,
          ...fresh.map((t) => SOCIOGRAM_STEPS[t]!(plural, singular)),
        ].join('\n\n'),
      };
    case 'relationshipCensus':
      return {
        title: `How the ${plural} you named are connected`,
        text:
          s.method === 'one_at_a_time'
            ? `On the next screen you will see the ${plural} you named one at a time. For each one, tap everyone else the question describes, then move on.`
            : s.method === 'with_strength'
              ? `On the next screen you will see pairs of the ${plural} you named. For each pair, choose the answer that describes them best.`
              : `On the next screen you will see pairs of the ${plural} you named. Answer the question for each pair.`,
      };
    case 'networkComposer':
      return {
        title: 'Drawing your network',
        // only the tools the stage has: the palette hides the others
        text: [
          `Next, you and the interviewer will draw your network together. Add ${plural} and move them around.`,
          ...(s.attributeIds.length
            ? [`You can answer a few questions about each ${singular}.`]
            : []),
          ...(s.groupAttributeId ? [`You can put ${plural} into groups.`] : []),
          ...(s.relationships.length
            ? [`You can draw lines between ${plural} who are connected.`]
            : []),
        ].join(' '),
      };
    case 'geospatial':
      return {
        title: 'On the map',
        text: `On the next screen you will see a map. For each of the ${plural} you named, tap the place the question asks about.`,
      };
    case 'information':
    case 'egoForm':
    case 'narrative':
      return { title: '', text: '' };
    default: {
      const unhandled: never = s;
      throw new Error('Unhandled stage kind', { cause: unhandled });
    }
  }
};

/**
 * The design stages that get an introduction screen, by stage id, with
 * draft wording. A stage right after a design instructions screen that
 * always shows keeps that screen as its introduction.
 */
export const taskIntroductions = (
  d: NormalizedDesign,
): Map<string, TaskIntroduction> => {
  const introduced = new Set<string>();
  // node types someone is surely named for, as compile() decides its
  // no-one-exists skip
  const guaranteed = new Set<string>();
  const surelyShown = (s: NStage) => {
    if (s.skipLogic.mode !== 'always_show' || s.kind === 'relationshipForm')
      return false;
    if (
      !('nodeTypeId' in s) ||
      s.kind === 'nameGenerator' ||
      s.kind === 'networkComposer'
    )
      return true;
    return (
      guaranteed.has(s.nodeTypeId) &&
      !('filter' in s && s.filter.conditions.length)
    );
  };
  const out = new Map<string, TaskIntroduction>();
  d.stages.forEach((s, i) => {
    if (
      s.kind === 'nameGenerator' &&
      s.skipLogic.mode === 'always_show' &&
      s.minNodes >= 1
    )
      guaranteed.add(s.nodeTypeId);
    const fresh = tasksOf(s).filter((t) => !introduced.has(t));
    if (!fresh.length) return;
    // the design's instructions screen stands in only when it always shows
    const prev = d.stages[i - 1];
    if (
      prev?.kind !== 'information' ||
      prev.role !== 'instructions' ||
      prev.skipLogic.mode !== 'always_show'
    )
      out.set(s.id, draft(d, s, fresh));
    if (surelyShown(s)) fresh.forEach((t) => introduced.add(t));
  });
  return out;
};
