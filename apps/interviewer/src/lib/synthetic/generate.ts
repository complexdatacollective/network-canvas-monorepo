import { v4 as uuid } from 'uuid';

import { getInterviewProgress } from '@codaco/interview';
import { generateNetwork } from '@codaco/protocol-utilities';
import {
  createSession,
  deleteSessions,
  getProtocolByHash,
  updateSession,
} from '~/lib/db/api';

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
    codebook: protocol.codebook,
    stages: protocol.protocol.stages,
    simulateDropOut,
    respectSkipLogicAndFiltering,
    externalData,
  };
  const generated: GeneratedRow[] = [];

  try {
    let completedCount = 0;

    for (let i = 0; i < count; i++) {
      const { network, stageMetadata, currentStep, droppedOut } =
        generateNetwork({
          ...genOptions,
          // A corpus, not a preview. `showcase` forces the rare pedigree
          // arrangements into every session, which is what a single previewed
          // pedigree wants and what an aggregate emphatically does not.
          config: { pedigreeMode: 'populationRates' as const },
        });

      const session = await createSession({
        protocolHash,
        protocolName: protocol.name,
        caseId: `synthetic-${uuid()}`,
        initialNetwork: network,
        isSynthetic: true,
      });

      // Record the row before filling it in: `createSession` has already
      // committed it, so a rejected `updateSession` (a failed encryption or
      // IndexedDB write) has to roll this row back too, not just its
      // predecessors.
      generated.push({ sessionId: session.id, droppedOut });

      await updateSession(session.id, {
        currentStep,
        progress: getInterviewProgress(protocol.protocol.stages, currentStep)
          .progress,
        stageMetadata: stageMetadata ?? undefined,
        finishedAt: droppedOut ? null : new Date().toISOString(),
      });

      if (!droppedOut) completedCount++;
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
          const { network, stageMetadata, currentStep } = generateNetwork({
            ...genOptions,
            simulateDropOut: false,
          });
          await updateSession(row.sessionId, {
            network,
            currentStep,
            progress: getInterviewProgress(
              protocol.protocol.stages,
              currentStep,
            ).progress,
            stageMetadata: stageMetadata ?? undefined,
            finishedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    // `generateNetwork` refuses a protocol whose validation rules can't all be
    // satisfied. Its up-front feasibility analysis catches most of those, but a
    // protocol can pass that check and still exhaust the draw on a later seed,
    // so the throw can land part-way through a batch that has already written
    // sessions. Undo them: nothing is kept unless the whole batch succeeded, so
    // a retry can't stack a partial duplicate batch on top of the first attempt.
    try {
      await deleteSessions(generated.map((row) => row.sessionId));
    } catch {
      // A failing rollback means the database itself is broken; the generation
      // failure is still the actionable error, and the caller re-reads the
      // stored count either way, so the number on screen stays honest.
    }
    throw error;
  }

  return count;
}
