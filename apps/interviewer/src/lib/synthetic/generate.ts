import { v4 as uuid } from 'uuid';

import { getInterviewProgress } from '@codaco/interview';
import { generateNetwork } from '@codaco/protocol-utilities';
import { createSession, getProtocolByHash, updateSession } from '~/lib/db/api';

import { loadRosterNodesForStages } from './loadRosterData';

type GenerateOptions = {
  protocolHash: string;
  count: number;
  simulateDropOut: boolean;
  respectSkipLogicAndFiltering: boolean;
  onProgress?: (current: number, total: number) => void;
};

type GeneratedRow = {
  sessionId: string;
  droppedOut: boolean;
};

export async function generateSyntheticSessions(
  opts: GenerateOptions,
): Promise<number> {
  const {
    protocolHash,
    count,
    simulateDropOut,
    respectSkipLogicAndFiltering,
    onProgress,
  } = opts;

  const protocol = await getProtocolByHash(protocolHash);
  if (!protocol) {
    throw new Error(`Protocol not found for hash "${protocolHash}".`);
  }

  const externalData = await loadRosterNodesForStages(protocol);

  const genOptions = {
    simulateDropOut,
    respectSkipLogicAndFiltering,
    externalData,
  };
  const generated: GeneratedRow[] = [];
  let completedCount = 0;

  for (let i = 0; i < count; i++) {
    const { network, stageMetadata, currentStep, droppedOut } = generateNetwork(
      protocol.codebook,
      protocol.protocol.stages,
      genOptions,
    );

    const session = await createSession({
      protocolHash,
      protocolName: protocol.name,
      caseId: `synthetic-${uuid()}`,
      initialNetwork: network,
      isSynthetic: true,
    });

    await updateSession(session.id, {
      currentStep,
      progress: getInterviewProgress(protocol.protocol.stages, currentStep)
        .progress,
      stageMetadata: stageMetadata ?? undefined,
      finishedAt: droppedOut ? null : new Date().toISOString(),
    });

    if (!droppedOut) completedCount++;
    generated.push({ sessionId: session.id, droppedOut });
    onProgress?.(i + 1, count);
  }

  // Mirror fresco-next: guarantee at least 10% completed sessions when
  // simulating drop-out, so exports always have some completed data.
  if (simulateDropOut) {
    const minCompleted = Math.max(1, Math.ceil(count * 0.1));
    if (completedCount < minCompleted) {
      const deficit = minCompleted - completedCount;
      const toFix = generated.filter((g) => g.droppedOut).slice(0, deficit);

      for (const row of toFix) {
        const { network, stageMetadata, currentStep } = generateNetwork(
          protocol.codebook,
          protocol.protocol.stages,
          { ...genOptions, simulateDropOut: false },
        );
        await updateSession(row.sessionId, {
          network,
          currentStep,
          progress: getInterviewProgress(protocol.protocol.stages, currentStep)
            .progress,
          stageMetadata: stageMetadata ?? undefined,
          finishedAt: new Date().toISOString(),
        });
      }
    }
  }

  return count;
}
