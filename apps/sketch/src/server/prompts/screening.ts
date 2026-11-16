// Step 1, "Reading your research questions": a cheap gate that only refuses
// text with no study in it, and writes the one-line summary the progress list
// shows.

import type { ChatMessage } from '../providers/types.ts';
import screening from './screening.md';

export const SCREENING_SYSTEM = screening.trimEnd();

export const buildScreeningMessages = (description: string): ChatMessage[] => [
  { role: 'user', content: `<study>\n${description}\n</study>` },
];
