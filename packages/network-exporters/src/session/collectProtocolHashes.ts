import type { InterviewExportInput } from '../input';

export function collectProtocolHashes(
  sessions: InterviewExportInput[],
): string[] {
  return [...new Set(sessions.map((s) => s.protocolHash))];
}
