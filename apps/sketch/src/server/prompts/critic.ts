// Step 2, second call: "Reviewing the design". A critic who did not write
// the design reviews it and returns findings plus edits (design/critique.ts).
// The system prompt is a constant, so it is cached across jobs; the study,
// the design and the compiled counts go in the user message. The prompt
// text is in ./critic.md, followed by the decision guide.

import type { Burden, StageCost } from '../design/burden.ts';
import type { StudyDesign } from '../design/schema.ts';
import type { ChatMessage } from '../providers/types.ts';
import critic from './critic.md';
import { DECISION_GUIDE } from './decision-guide.ts';

export const CRITIC_SYSTEM = `${critic.trimEnd()}\n\n${DECISION_GUIDE}`;

const costLines = (costs: StageCost[]) =>
  costs
    .filter((c) => c.answers > 0)
    .toSorted((a, b) => b.answers - a.answers)
    .slice(0, 6)
    .map(
      (c) =>
        `- ${c.label} (${c.type}): about ${c.screens} screens and ${c.answers} answers, ${c.filtered ? 'filtered to some people' : 'asked about everyone'}`,
    )
    .join('\n');

export const buildCritiqueMessages = (
  description: string,
  design: StudyDesign,
  burden: Burden,
  costs: StageCost[] = [],
): ChatMessage[] => {
  const heaviest = costLines(costs);
  return [
    {
      role: 'user',
      content: `Review this Network Canvas study design.

<study>
${description}
</study>

<design>
${JSON.stringify(design, null, 1)}
</design>

Compiled, at about ${burden.people} people per participant, the interview has ${burden.stages} stages, about ${burden.screens} screens, ${burden.itemsPerPerson} questions about each person and about ${burden.answers} answers in all.${heaviest ? `\n\nThe heaviest stages (a filter is counted as keeping about half the people):\n${heaviest}` : ''}`,
    },
  ];
};
