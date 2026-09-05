import {
  act,
  render,
  type RenderResult,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isEqual } from 'es-toolkit/compat';
import type { ReactNode } from 'react';
import { expect } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryCompoundHost } from '../compound-edit/InMemoryCompoundHost.ts';
import { useStageEditorController } from '../controller.ts';
import StageEditorShell from '../form/StageEditorShell.tsx';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  type FinishRequest,
  type PendingCommandBatch,
  ProtocolBuilderSessionStore,
} from '../session.ts';
import type {
  StageEditorComponent,
  StageEditorRegistry,
} from '../stage-editor-contract.ts';
import StageEditor from '../StageEditor.tsx';
import {
  fixtureAssetManifest,
  fixtureProtocolSections,
  loadFixtureStage,
} from './protocolFixture.ts';

const DEFAULT_SUBMIT_LABEL = 'Save stage';

const OWNER = 'harness-tab';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A change to the codebook made somewhere other than this editor.
 *
 * `null` removes the entity. The editor must follow either kind without
 * issuing a command of its own: a collaborator adding a variable is not this
 * session's edit, and echoing it back would write their change into this
 * stage's pending batches and save it as ours.
 */
export type CodebookPatch = Readonly<{
  node?: Readonly<Record<string, SectionDoc | null>>;
  edge?: Readonly<Record<string, SectionDoc | null>>;
  ego?: SectionDoc | null;
}>;

export type StageEditorHarness = RenderResult &
  Readonly<{
    session: ProtocolBuilderSessionStore;
    host: InMemoryCompoundHost;
    gateway: InMemoryResourceGateway;
    user: ReturnType<typeof userEvent.setup>;
    /** The stage the editor opened on, exactly as it was seeded. */
    seeded: Readonly<{ id: string; type: StageType; fields: SectionDoc }>;
    /**
     * Saves the stage and answers with what the host was asked to commit, or
     * `null` when the editor refused to save.
     */
    submit(): Promise<FinishRequest | null>;
    /** Ends the session without finishing, discarding anything staged. */
    cancel(): Promise<void>;
    /** Applies a codebook change as if another session had made it. */
    receiveCodebookUpdate(patch: CodebookPatch): void;
    /** Every local batch the authoritative protocol has not acknowledged. */
    pendingCommands(): readonly PendingCommandBatch[];
    /**
     * Saves the stage unchanged and proves nothing was dropped on the way.
     *
     * The one test every named editor owes the schema: a stage a researcher
     * opened and saved without touching must come back the same. An editor
     * that has no section for one of its interface's keys silently drops it
     * otherwise, and the loss only shows up in an exported protocol.
     */
    roundTrip(): Promise<FinishRequest>;
    /** The section outline, in the order it is rendered. */
    outline(): { title: string; state: string }[];
    /** Takes editing away from this session, or gives it back. */
    setReadOnly(readOnly?: boolean): void;
  }>;

export type RenderStageEditorOptions = Readonly<{
  /** Open this stage of the shared all-interfaces protocol. */
  stageId?: string;
  /** Or open a stage of this type holding these fields. */
  stage?: Readonly<{ id?: string; type: StageType; fields: SectionDoc }>;
  /**
   * The named editor under test, which brings its own shell.
   *
   * Exactly one of `editor` and `sections` is given. Neither means the
   * package's own dispatcher chooses, which is how a registry is tested.
   */
  editor?: StageEditorComponent;
  /** Or the sections under test, which the harness puts in the shared shell. */
  sections?: ReactNode;
  /** The editors the dispatcher chooses from, when neither of the above is given. */
  registry?: Partial<StageEditorRegistry>;
  /** Accessible name of the control that saves the stage. */
  submitLabel?: string;
  /** Open the stage as a spectator. */
  readOnly?: boolean;
}>;

/**
 * Mounts a stage editor over a real editing session.
 *
 * Everything below the editor is the package's own production machinery: a
 * `ProtocolBuilderSessionStore` holding a real protocol, a compound-edit host
 * that refuses what a real one would refuse, and a resource gateway. Nothing
 * is stubbed, so a test that saves a stage has proved the protocol schema
 * accepts it, and a test that creates a codebook entity has proved the host
 * could apply both halves at once.
 */
export function renderStageEditor(
  options: RenderStageEditorOptions = {},
): StageEditorHarness {
  const seeded = seedFrom(options);
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const baseSections = fixtureProtocolSections();
  // A stage the fixture does not contain still has to be part of the protocol
  // it is validated inside, or every save fails on the stage order.
  const protocolSections: Record<string, SectionDoc> = {
    ...baseSections,
    [stageSectionId]: { id: seeded.id, type: seeded.type, ...seeded.fields },
  };
  protocolSections[sectionId({ kind: 'stageOrder' })] = {
    stages: stageOrderWith(baseSections, seeded.id),
  };

  const manifestRevision = { sequence: 1n, hash: 'revision-1' };
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision,
    leases: [
      {
        sectionId: stageSectionId,
        leaseOwner: OWNER,
        leaseEpoch: 1n,
        holder: {
          sessionId: OWNER,
          userId: 'researcher',
          displayName: 'Researcher',
          sectionId: stageSectionId,
          mode: 'editing',
        },
      },
    ],
  });
  const gateway = new InMemoryResourceGateway({
    committed: fixtureResources(),
  });

  const finishRequests: FinishRequest[] = [];
  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity(seeded.type, () => seeded.id),
    fields: seeded.fields,
    protocolSections,
    manifestRevision,
    access:
      options.readOnly === true
        ? { mode: 'readOnly', reason: 'spectator' }
        : { mode: 'editable', leaseOwner: OWNER, leaseEpoch: 1n },
    resourceGateway: gateway,
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({
        ...sections,
        [stageSectionId]: stageDocument,
      }),
    onCompoundEdit: (submission) => host.submit(submission),
    onFinish: (request) => {
      finishRequests.push(request);
    },
  });

  const submitLabel = options.submitLabel ?? DEFAULT_SUBMIT_LABEL;
  const view = render(
    <DialogProvider>
      <HarnessEditor
        session={session}
        submitLabel={submitLabel}
        {...(options.editor === undefined ? {} : { editor: options.editor })}
        {...(options.sections === undefined
          ? {}
          : { sections: options.sections })}
        {...(options.registry === undefined
          ? {}
          : { registry: options.registry })}
      />
    </DialogProvider>,
  );

  const user = userEvent.setup();
  let revision = 1n;

  const submit = async (): Promise<FinishRequest | null> => {
    const before = finishRequests.length;
    const button = screen.getByRole('button', { name: submitLabel });
    await user.click(button);
    await waitFor(() => {
      if (finishRequests.length > before) return;
      // A submit that did not finish has settled and left its reason on
      // screen: the form's own errors, or a field marked invalid for
      // `focusFirstError` to reach. Asserting both is what stops a submit
      // still in flight from being read as a refusal.
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(refusalOnScreen(view.baseElement)).toBe(true);
    });
    return finishRequests.at(-1) ?? null;
  };

  return {
    ...view,
    session,
    host,
    gateway,
    user,
    seeded,
    submit,
    cancel: async () => {
      await act(async () => {
        await session.cancel();
      });
    },
    receiveCodebookUpdate: (patch) => {
      revision += 1n;
      act(() => {
        session.receiveAuthoritativeUpdate({
          protocolSections: patchedCodebook(
            session.getSnapshot().protocolSections,
            patch,
          ),
          manifestRevision: {
            sequence: revision,
            hash: `revision-${revision}`,
          },
        });
      });
    },
    pendingCommands: () => session.getSnapshot().pendingCommands,
    roundTrip: async () => {
      const request = await submit();
      if (request === null) {
        throw new Error(
          `The stage did not save, so nothing round-tripped. The editor is showing: ${visibleProblems(view.baseElement)}`,
        );
      }
      const lost: string[] = [];
      const changed: string[] = [];
      for (const [key, value] of Object.entries(seeded.fields)) {
        if (!Object.hasOwn(request.stageDocument, key)) {
          lost.push(key);
        } else if (!isEqual(request.stageDocument[key], value)) {
          changed.push(key);
        }
      }
      if (lost.length > 0 || changed.length > 0) {
        throw new Error(
          `Saving "${seeded.id}" unchanged did not return the same stage.${
            lost.length > 0 ? ` Dropped: ${lost.join(', ')}.` : ''
          }${changed.length > 0 ? ` Changed: ${changed.join(', ')}.` : ''}`,
        );
      }
      return request;
    },
    outline: () => readOutline(),
    setReadOnly: (readOnly = true) => {
      act(() => {
        session.setAccess(
          readOnly
            ? { mode: 'readOnly', reason: 'lease-lost' }
            : { mode: 'editable', leaseOwner: OWNER, leaseEpoch: 2n },
        );
      });
    },
  };
}

function HarnessEditor({
  session,
  submitLabel,
  editor: Editor,
  sections,
  registry,
}: Readonly<{
  session: ProtocolBuilderSessionStore;
  submitLabel: string;
  editor?: StageEditorComponent;
  sections?: ReactNode;
  registry?: Partial<StageEditorRegistry>;
}>) {
  const controller = useStageEditorController(session, 'stage-form');

  if (Editor !== undefined) {
    return (
      <Editor
        controller={controller}
        stageType={controller.snapshot.editedSection.identity.type}
      />
    );
  }

  if (sections === undefined) {
    return (
      <StageEditor
        controller={controller}
        {...(registry === undefined ? {} : { registry })}
      />
    );
  }

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>{submitLabel}</SubmitButton>
      )}
    >
      {sections}
    </StageEditorShell>
  );
}

function seedFrom(
  options: RenderStageEditorOptions,
): Readonly<{ id: string; type: StageType; fields: SectionDoc }> {
  if (options.stage !== undefined) {
    const { id = 'stage-under-test', type, fields } = options.stage;
    return { id, type, fields };
  }
  if (options.stageId === undefined) {
    throw new Error(
      'renderStageEditor needs a stage: pass `stageId` to open one from the all-interfaces protocol, or `stage` to build one.',
    );
  }
  return loadFixtureStage(options.stageId);
}

/** The interview's stage order, with the edited stage in it exactly once. */
function stageOrderWith(
  sections: Readonly<Record<string, SectionDoc>>,
  stageId: string,
): string[] {
  const order = sections[sectionId({ kind: 'stageOrder' })]?.stages;
  const stages = Array.isArray(order)
    ? order.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return stages.includes(stageId) ? stages : [...stages, stageId];
}

function patchedCodebook(
  sections: Readonly<Record<string, SectionDoc>>,
  patch: CodebookPatch,
): Record<string, SectionDoc> {
  const next: Record<string, SectionDoc> = { ...sections };
  for (const [typeId, definition] of Object.entries(patch.node ?? {})) {
    const id = sectionId({ kind: 'codebookNode', typeId });
    if (definition === null) delete next[id];
    else next[id] = definition;
  }
  for (const [typeId, definition] of Object.entries(patch.edge ?? {})) {
    const id = sectionId({ kind: 'codebookEdge', typeId });
    if (definition === null) delete next[id];
    else next[id] = definition;
  }
  if (patch.ego !== undefined) {
    const id = sectionId({ kind: 'codebookEgo' });
    if (patch.ego === null) delete next[id];
    else next[id] = patch.ego;
  }
  return next;
}

/**
 * The fixture's assets, as resources a gateway already holds.
 *
 * Content-bearing assets are seeded with a placeholder body: an editor reads a
 * resource's kind, name and size to decide what it may reference, and the
 * bytes belong to the host.
 */
function fixtureResources(): InMemoryResourceSeed[] {
  return Object.entries(fixtureAssetManifest()).flatMap(
    ([id, entry]): InMemoryResourceSeed[] => {
      if (!isRecord(entry)) return [];
      const name = typeof entry.name === 'string' ? entry.name : id;
      const kind = entry.type;
      if (kind === 'apikey') {
        return [{ kind: 'apikey' as const, id, name, value: 'fixture-secret' }];
      }
      if (
        kind !== 'audio' &&
        kind !== 'geojson' &&
        kind !== 'image' &&
        kind !== 'network' &&
        kind !== 'video'
      ) {
        return [];
      }
      return [
        {
          kind,
          id,
          name,
          source:
            typeof entry.source === 'string' ? entry.source : `${id}.json`,
          contentType: 'application/json',
          bytes: new TextEncoder().encode('{}'),
        },
      ];
    },
  );
}

function readOutline(): { title: string; state: string }[] {
  const nav = screen.queryByRole('navigation', { name: 'Stage sections' });
  if (nav === null) return [];
  return [...nav.querySelectorAll('button')].map((button) => {
    const [title, state] = [...button.querySelectorAll('span')];
    return {
      title: title?.textContent ?? '',
      state: state?.textContent ?? '',
    };
  });
}

function refusalOnScreen(root: Element | Document): boolean {
  return (
    root.querySelector('[aria-invalid="true"]') !== null ||
    root.querySelector('[role="alert"]') !== null
  );
}

function visibleProblems(root: Element | Document): string {
  const alerts = [...root.querySelectorAll('[role="alert"]')].map(
    (alert) => alert.textContent ?? '',
  );
  return alerts.length > 0 ? alerts.join(' | ') : 'nothing it could name';
}
