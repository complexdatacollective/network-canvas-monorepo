import { useEffect, useState } from 'react';

import {
  ProtocolBuilderSessionStore,
  stageDocument,
  stageDraftFromDocument,
  type ProtocolBuilderSession,
} from '@codaco/protocol-builder/session';
import { applyCommands, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { rpcClient } from '../lib/api.ts';

type Draft = Awaited<ReturnType<typeof rpcClient.protocols.draft>>;

export type StudioStageSessionState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | {
      status: 'ready';
      session: ProtocolBuilderSession;
      message: string;
    };

export function useStudioStageSession(params: {
  teamId: string;
  protocolId: string;
  draftId: string;
  clientId: string;
  stageId: string | null;
  draft: Draft;
  onCommitted: () => Promise<void> | void;
}): StudioStageSessionState {
  const [state, setState] = useState<StudioStageSessionState>({
    status: 'loading',
  });

  useEffect(() => {
    if (params.stageId === null) {
      setState({ status: 'failed', message: 'Select a screen to edit.' });
      return () => undefined;
    }

    const selectedSectionId = sectionId({
      kind: 'stage',
      stageId: params.stageId,
    });
    const document = params.draft.sections[selectedSectionId];
    if (document === undefined) {
      setState({
        status: 'failed',
        message: 'The selected screen is no longer in this draft.',
      });
      return () => undefined;
    }

    let active = true;
    let renewal: ReturnType<typeof setInterval> | undefined;
    let release: (() => Promise<void>) | undefined;
    setState({ status: 'loading' });

    void rpcClient.protocols
      .acquireSection({
        teamId: params.teamId,
        protocolId: params.protocolId,
        draftId: params.draftId,
        sectionId: selectedSectionId,
        clientId: params.clientId,
      })
      .then((access) => {
        if (!active) return undefined;
        const { identity, fields } = stageDraftFromDocument(document);
        let committedFields: SectionDoc = structuredClone(fields);
        let clientSequence = 1n;
        let commitFailed = false;
        let queue = Promise.resolve();

        const store = new ProtocolBuilderSessionStore({
          identity,
          fields,
          protocolSections: params.draft.sections,
          manifestRevision: {
            sequence: BigInt(params.draft.revision.sequence),
            hash: params.draft.revision.hash,
          },
          access:
            access.mode === 'editable'
              ? {
                  mode: 'editable',
                  leaseOwner: params.clientId,
                  leaseEpoch: BigInt(access.leaseEpoch),
                }
              : { mode: 'readOnly', reason: 'spectator' },
          buildCandidate: ({ stageDocument: currentStage, protocolSections }) =>
            assembleProtocolSections({
              ...protocolSections,
              [selectedSectionId]: currentStage,
            }),
          onCommands: (batch) => {
            if (access.mode !== 'editable') return;
            queue = queue
              .then(async () => {
                if (commitFailed) return undefined;
                const revision = await rpcClient.protocols.commitSection({
                  teamId: params.teamId,
                  protocolId: params.protocolId,
                  draftId: params.draftId,
                  sectionId: selectedSectionId,
                  clientId: params.clientId,
                  leaseEpoch: access.leaseEpoch,
                  clientSequence: String(clientSequence++),
                  commands: [...batch.commands],
                });
                committedFields = applyCommands(committedFields, [
                  ...batch.commands,
                ]);
                store.receiveAuthoritativeUpdate({
                  protocolSections: {
                    ...params.draft.sections,
                    [selectedSectionId]: stageDocument(
                      identity,
                      committedFields,
                    ),
                  },
                  manifestRevision: {
                    sequence: BigInt(revision.sequence),
                    hash: revision.hash,
                  },
                });
                store.acknowledge({
                  fields: committedFields,
                  throughBatchId: batch.id,
                  manifestRevision: {
                    sequence: BigInt(revision.sequence),
                    hash: revision.hash,
                  },
                });
                if (active) {
                  setState({
                    status: 'ready',
                    session: store,
                    message: 'Changes saved.',
                  });
                  await params.onCommitted();
                }
                return undefined;
              })
              .catch(() => {
                commitFailed = true;
                store.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
                if (active) {
                  setState({
                    status: 'ready',
                    session: store,
                    message:
                      'Editing stopped because Studio could not save this screen.',
                  });
                }
                return undefined;
              });
          },
          onFinish: async () => queue,
        });

        setState({
          status: 'ready',
          session: store,
          message:
            access.mode === 'editable'
              ? 'This screen is ready to edit.'
              : 'This screen is open read-only because someone else is editing it.',
        });

        if (access.mode === 'editable') {
          const renew = async () => {
            try {
              const result = await rpcClient.protocols.renewSection({
                teamId: params.teamId,
                protocolId: params.protocolId,
                draftId: params.draftId,
                sectionId: selectedSectionId,
                clientId: params.clientId,
                leaseEpoch: access.leaseEpoch,
              });
              if (!result.renewed) throw new Error('lease expired');
            } catch {
              commitFailed = true;
              store.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
              if (active) {
                setState({
                  status: 'ready',
                  session: store,
                  message: 'Editing stopped because the screen lock was lost.',
                });
              }
            }
          };
          renewal = setInterval(() => void renew(), 10_000);
          release = () =>
            rpcClient.protocols.releaseSection({
              teamId: params.teamId,
              protocolId: params.protocolId,
              draftId: params.draftId,
              sectionId: selectedSectionId,
              clientId: params.clientId,
              leaseEpoch: access.leaseEpoch,
            });
        }
        return undefined;
      })
      .catch(() => {
        if (active) {
          setState({
            status: 'failed',
            message: 'This screen could not be opened. Try again.',
          });
        }
        return undefined;
      });

    return () => {
      active = false;
      if (renewal !== undefined) clearInterval(renewal);
      if (release !== undefined) void release().catch(() => undefined);
    };
  }, [
    params.clientId,
    params.draft,
    params.draftId,
    params.onCommitted,
    params.protocolId,
    params.stageId,
    params.teamId,
  ]);

  return state;
}
