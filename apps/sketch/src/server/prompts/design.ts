// Step 2, "Designing the study". The system prompt is the cached prefix of
// every design call (and of its retry), so it is a constant: nothing about
// the request may be interpolated into it. The researcher's research
// questions and synopsis go in the user message. The prompt text is in
// ./design.md, followed by the decision guide.

import type { ChatMessage } from '../providers/types.ts';
import { DECISION_GUIDE } from './decision-guide.ts';
import design from './design.md';

export const DESIGN_SYSTEM = `${design.trimEnd()}\n\n${DECISION_GUIDE}`;

export const buildDesignMessages = (description: string): ChatMessage[] => [
  {
    role: 'user',
    content: `Design a Network Canvas interview for this study.\n\n<study>\n${description}\n</study>`,
  },
];

// Attempt 1 was cut off or did not parse.
export const UNPARSEABLE_FEEDBACK =
  'Your previous answer was cut off or unparseable; return the complete StudyDesign.';
