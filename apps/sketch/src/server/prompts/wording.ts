// Step 3, "Writing titles and prompts": a cheap model polishes the drafts in
// buildWordingRequest's output. It never changes the design; anything it
// leaves blank falls back to the drafts.

import type { ChatMessage } from '../providers/types.ts';
import wording from './wording.md';

export const WORDING_SYSTEM = wording.trimEnd();

export const buildWordingMessages = (request: unknown): ChatMessage[] => [
  {
    role: 'user',
    content: `Word this interview.\n\n${JSON.stringify(request, null, 2)}`,
  },
];
