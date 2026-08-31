import { useEffect, useRef, useState } from 'react';

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
import { createUuid } from '../lib/createUuid.ts';
import { registerStudioEditorSession } from './sessionLifecycle.ts';

type Draft = Awaited<ReturnType<typeof rpcClient.protocols.draft>>;

export type StudioStageSessionState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | {
      status: 'ready';
      session: ProtocolBuilderSession;
      message: string;
      save: () => Promise<void>;
    };

type SessionRuntime = Readonly<{
  draftId: string;
  sectionId: string;
  store: ProtocolBuilderSessionStore;
}>;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Studio could not save.');
}

export function useStudioStageSession(params: {
  teamId: string;
  protocolId: string;
  draftId: string;
  stageId: string | null;
  draft: Draft;
  onCommitted: () => Promise<void> | void;
}): StudioStageSessionState {
  const [state, setState] = useState<StudioStageSessionState>({
    status: 'loading',
  });
  const latestDraft = useRef(params.draft);
  const onCommitted = useRef(params.onCommitted);
  const runtime = useRef<SessionRuntime | null>(null);
  latestDraft.current = params.draft;
  onCommitted.current = params.onCommitted;

  useEffect(() => {
    const current = runtime.current;
    if (current === null || current.draftId !== params.draftId) return;

    const incomingRevision = BigInt(params.draft.revision.sequence);
    if (
      incomingRevision < current.store.getSnapshot().manifestRevision.sequence
    )
      return;

    current.store.receiveAuthoritativeUpdate({
      protocolSections: params.draft.sections,
      manifestRevision: {
        sequence: incomingRevision,
        hash: params.draft.revision.hash,
      },
    });
  }, [params.draft, params.draftId]);

  useEffect(() => {
    if (params.stageId === null) {
      setState({ status: 'failed', message: 'Select a screen to edit.' });
      return () => undefined;
    }

    const selectedSectionId = sectionId({
      kind: 'stage',
      stageId: params.stageId,
    });
    const leaseClientId = createUuid();
    const document = latestDraft.current.sections[selectedSectionId];
    if (document === undefined) {
      setState({
        status: 'failed',
        message: 'The selected screen is no longer in this draft.',
      });
      return () => undefined;
    }
    const initialDocument = document;

    let active = true;
    let acquiring = false;
    let renewal: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setInterval> | undefined;
    let currentLease: Readonly<{ leaseEpoch: string }> | null = null;
    let store: ProtocolBuilderSessionStore;
    let save: () => Promise<void>;
    let committedFields: SectionDoc;
    let clientSequence = 1n;
    let commitFailure: Error | null = null;
    let queue: Promise<void> = Promise.resolve();
    let initialization: Promise<void> = Promise.resolve();
    let promotion: Promise<void> = Promise.resolve();
    let releaseBarrier: Promise<void> = Promise.resolve();
    let closePromise: Promise<void> | null = null;
    setState({ status: 'loading' });

    const releaseLease = async (lease: Readonly<{ leaseEpoch: string }>) => {
      await rpcClient.protocols.releaseSection({
        teamId: params.teamId,
        protocolId: params.protocolId,
        draftId: params.draftId,
        sectionId: selectedSectionId,
        clientId: leaseClientId,
        leaseEpoch: lease.leaseEpoch,
      });
    };
    const releaseLeaseAfterQueue = (
      lease: Readonly<{ leaseEpoch: string }>,
    ): Promise<void> => {
      const pendingQueue = queue;
      releaseBarrier = releaseBarrier
        .then(() =>
          pendingQueue.then(
            () => releaseLease(lease),
            () => releaseLease(lease),
          ),
        )
        .catch(() => undefined);
      return releaseBarrier;
    };

    const refreshDraftWhileRenewingLease = async (
      lease: Readonly<{ leaseEpoch: string }>,
    ): Promise<Draft> => {
      let renewalFailure: Error | null = null;
      let renewalInFlight: Promise<void> | null = null;
      const renew = () => {
        if (renewalInFlight !== null || renewalFailure !== null) return;
        renewalInFlight = rpcClient.protocols
          .renewSection({
            teamId: params.teamId,
            protocolId: params.protocolId,
            draftId: params.draftId,
            sectionId: selectedSectionId,
            clientId: leaseClientId,
            leaseEpoch: lease.leaseEpoch,
          })
          .then((result) => {
            if (!result.renewed) {
              renewalFailure = new Error('screen lock expired');
            }
          })
          .catch((error: unknown) => {
            renewalFailure = asError(error);
          })
          .finally(() => {
            renewalInFlight = null;
          });
      };
      const refreshRenewal = setInterval(renew, 10_000);
      try {
        const refreshed = await rpcClient.protocols.draft({
          teamId: params.teamId,
          protocolId: params.protocolId,
          draftId: params.draftId,
        });
        const pendingRenewal = renewalInFlight;
        if (pendingRenewal !== null) await pendingRenewal;
        const renewalError = renewalFailure;
        if (renewalError !== null) throw renewalError;
        return refreshed;
      } finally {
        clearInterval(refreshRenewal);
      }
    };

    const stopRenewal = () => {
      if (renewal !== undefined) clearInterval(renewal);
      renewal = undefined;
    };
    const stopRetry = () => {
      if (retry !== undefined) clearInterval(retry);
      retry = undefined;
    };

    const showReady = (message: string) => {
      if (active) setState({ status: 'ready', session: store, message, save });
    };

    const retryAcquisition = () => {
      if (!active) return;
      if (retry === undefined) {
        retry = setInterval(() => {
          if (!acquiring) promotion = attemptPromotion();
        }, 5_000);
      }
    };

    const loseAccess = (error: unknown, message: string) => {
      const lease = currentLease;
      currentLease = null;
      commitFailure = asError(error);
      stopRenewal();
      store.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
      showReady(message);
      if (lease !== null) releaseLeaseAfterQueue(lease);
      retryAcquisition();
    };

    const startRenewal = () => {
      stopRenewal();
      renewal = setInterval(() => {
        const lease = currentLease;
        if (lease === null) return;
        void rpcClient.protocols
          .renewSection({
            teamId: params.teamId,
            protocolId: params.protocolId,
            draftId: params.draftId,
            sectionId: selectedSectionId,
            clientId: leaseClientId,
            leaseEpoch: lease.leaseEpoch,
          })
          .then((result) => {
            if (
              active &&
              currentLease?.leaseEpoch === lease.leaseEpoch &&
              !result.renewed
            ) {
              loseAccess(
                new Error('screen lock expired'),
                'Editing stopped because the screen lock was lost.',
              );
            }
            return undefined;
          })
          .catch((error: unknown) => {
            if (active && currentLease?.leaseEpoch === lease.leaseEpoch) {
              loseAccess(
                error,
                'Editing stopped because the screen lock was lost.',
              );
            }
          });
      }, 10_000);
    };

    async function attemptPromotion(): Promise<void> {
      if (!active || acquiring || currentLease !== null) return;
      acquiring = true;
      let acquiredLease: Readonly<{ leaseEpoch: string }> | null = null;
      try {
        await releaseBarrier;
        if (!active || currentLease !== null) return;
        const access = await rpcClient.protocols.acquireSection({
          teamId: params.teamId,
          protocolId: params.protocolId,
          draftId: params.draftId,
          sectionId: selectedSectionId,
          clientId: leaseClientId,
        });
        if (access.mode !== 'editable') return;
        acquiredLease = access;
        if (!active) {
          await releaseLease(access).catch(() => undefined);
          acquiredLease = null;
          return;
        }

        const refreshed = await refreshDraftWhileRenewingLease(access);
        if (!active) {
          await releaseLease(access).catch(() => undefined);
          acquiredLease = null;
          return;
        }
        const refreshedDocument = refreshed.sections[selectedSectionId];
        if (refreshedDocument === undefined) {
          await releaseLease(access).catch(() => undefined);
          acquiredLease = null;
          setState({
            status: 'failed',
            message: 'The selected screen is no longer in this draft.',
          });
          return;
        }

        const refreshedStage = stageDraftFromDocument(refreshedDocument);
        committedFields = structuredClone(refreshedStage.fields);
        store.replaceAuthoritativeStage({
          fields: refreshedStage.fields,
          manifestRevision: {
            sequence: BigInt(refreshed.revision.sequence),
            hash: refreshed.revision.hash,
          },
        });
        store.receiveAuthoritativeUpdate({
          protocolSections: refreshed.sections,
          manifestRevision: {
            sequence: BigInt(refreshed.revision.sequence),
            hash: refreshed.revision.hash,
          },
        });
        latestDraft.current = refreshed;
        currentLease = access;
        acquiredLease = null;
        clientSequence = BigInt(access.nextClientSequence);
        commitFailure = null;
        store.setAccess({
          mode: 'editable',
          leaseOwner: leaseClientId,
          leaseEpoch: BigInt(access.leaseEpoch),
        });
        stopRetry();
        startRenewal();
        showReady('The screen lock is available. You can edit this screen.');
        void Promise.resolve(onCommitted.current()).catch(() => undefined);
      } catch {
        if (acquiredLease !== null) {
          void releaseLeaseAfterQueue(acquiredLease);
        }
        retryAcquisition();
      } finally {
        acquiring = false;
      }
    }

    async function initialize(): Promise<void> {
      let acquiredLease: Readonly<{ leaseEpoch: string }> | null = null;
      try {
        const access = await rpcClient.protocols.acquireSection({
          teamId: params.teamId,
          protocolId: params.protocolId,
          draftId: params.draftId,
          sectionId: selectedSectionId,
          clientId: leaseClientId,
        });
        if (access.mode === 'editable') acquiredLease = access;
        if (!active) {
          if (acquiredLease !== null) await releaseLease(acquiredLease);
          return;
        }

        let authoritativeDraft = latestDraft.current;
        let authoritativeDocument: SectionDoc = initialDocument;
        const latestDocument = authoritativeDraft.sections[selectedSectionId];
        if (latestDocument !== undefined) {
          authoritativeDocument = latestDocument;
        }
        if (access.mode === 'editable') {
          authoritativeDraft = await refreshDraftWhileRenewingLease(access);
          if (!active) {
            await releaseLease(access);
            acquiredLease = null;
            return;
          }
          const refreshedDocument =
            authoritativeDraft.sections[selectedSectionId];
          if (refreshedDocument === undefined) {
            await releaseLease(access);
            acquiredLease = null;
            setState({
              status: 'failed',
              message: 'The selected screen is no longer in this draft.',
            });
            return;
          }
          authoritativeDocument = refreshedDocument;
          latestDraft.current = authoritativeDraft;
        }

        const { identity, fields } = stageDraftFromDocument(
          authoritativeDocument,
        );
        committedFields = structuredClone(fields);

        save = async () => {
          await queue;
          if (commitFailure !== null) throw commitFailure;
        };

        store = new ProtocolBuilderSessionStore({
          identity,
          fields,
          protocolSections: authoritativeDraft.sections,
          manifestRevision: {
            sequence: BigInt(authoritativeDraft.revision.sequence),
            hash: authoritativeDraft.revision.hash,
          },
          access:
            access.mode === 'editable'
              ? {
                  mode: 'editable',
                  leaseOwner: leaseClientId,
                  leaseEpoch: BigInt(access.leaseEpoch),
                }
              : { mode: 'readOnly', reason: 'spectator' },
          buildCandidate: ({ stageDocument: currentStage, protocolSections }) =>
            assembleProtocolSections({
              ...protocolSections,
              [selectedSectionId]: currentStage,
            }),
          onCommands: (batch) => {
            const lease = currentLease;
            if (lease === null) return;
            queue = queue
              .then(async () => {
                if (commitFailure !== null) return undefined;
                const revision = await rpcClient.protocols.commitSection({
                  teamId: params.teamId,
                  protocolId: params.protocolId,
                  draftId: params.draftId,
                  sectionId: selectedSectionId,
                  clientId: leaseClientId,
                  leaseEpoch: lease.leaseEpoch,
                  clientSequence: String(clientSequence++),
                  commands: [...batch.commands],
                });
                commitFailure = null;
                committedFields = applyCommands(committedFields, [
                  ...batch.commands,
                ]);
                store.receiveAuthoritativeUpdate({
                  protocolSections: {
                    ...store.getSnapshot().protocolSections,
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
                showReady('Changes saved.');
                void Promise.resolve(onCommitted.current()).catch(
                  () => undefined,
                );
                return undefined;
              })
              .catch((error: unknown) => {
                loseAccess(
                  error,
                  'Editing stopped because Studio could not save this screen.',
                );
              });
          },
          onFinish: async () => save(),
        });
        runtime.current = {
          draftId: params.draftId,
          sectionId: selectedSectionId,
          store,
        };

        if (access.mode === 'editable') {
          currentLease = access;
          acquiredLease = null;
          clientSequence = BigInt(access.nextClientSequence);
          startRenewal();
          showReady('This screen is ready to edit.');
          void Promise.resolve(onCommitted.current()).catch(() => undefined);
        } else {
          showReady(
            'This screen is open read-only because someone else is editing it.',
          );
          retryAcquisition();
        }
      } catch {
        if (acquiredLease !== null) {
          await releaseLease(acquiredLease).catch(() => undefined);
        }
        if (active) {
          setState({
            status: 'failed',
            message: 'This screen could not be opened. Try again.',
          });
        }
      }
    }

    initialization = initialize();

    const close = (): Promise<void> => {
      if (closePromise !== null) return closePromise;
      active = false;
      stopRenewal();
      stopRetry();
      closePromise = initialization.then(async () => {
        await promotion;
        await releaseBarrier;
        if (runtime.current?.store === store) runtime.current = null;
        const lease = currentLease;
        currentLease = null;
        if (lease === null) return;
        await queue.then(
          () => releaseLease(lease),
          () => releaseLease(lease),
        );
      });
      return closePromise;
    };
    const unregister = registerStudioEditorSession(close);

    return () => {
      void close().then(unregister, unregister);
    };
  }, [params.draftId, params.protocolId, params.stageId, params.teamId]);

  return state;
}
