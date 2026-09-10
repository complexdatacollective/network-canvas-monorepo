import { createORPCClient, DynamicLink, ORPCError } from '@orpc/client';
import type { ClientLink } from '@orpc/client';
import { RPCLink } from '@orpc/client/websocket';
import type { RouterContractClient } from '@orpc/contract';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi, useBlocker } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ProtocolBuilder } from '@codaco/protocol-builder/ProtocolBuilder';
import type { StageEditorActionContext } from '@codaco/protocol-builder/stage-editor-contract';
import StageEditor from '@codaco/protocol-builder/StageEditor';
import {
  useProtocolRevision,
  useRereadProtocol,
  useStageIndex,
  type StageSummary,
} from '@codaco/protocol-builder/state/hooks';
import { useCompleteProtocolSections } from '@codaco/protocol-builder/state/protocolContext';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import type { contract } from '@codaco/studio-rpc';
import { CLIENT_SESSION_PARAM } from '@codaco/studio-rpc/client-session';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { registerStudioEditorSession } from '../editor/sessionLifecycle.ts';
import { orpc, rpcClient } from '../lib/api.ts';
import { clientSessionId } from '../lib/clientSession.ts';
import { createUuid } from '../lib/createUuid.ts';

// The route id carries the area layout it sits under (§5.3), so it moved with
// the screen onto `/study/$studyId/editor`.
const route = getRouteApi('/app/study/$studyId/editor/');

/**
 * The same contract `lib/api.ts` builds its `/rpc` client from, over the other
 * transport the server serves it on. The protocol builder's host is one branch
 * of it (`client.protocolBuilder`), so the package and Studio are typed by one
 * contract and cannot drift apart.
 */
type StudioHostClient = RouterContractClient<typeof contract>;

/**
 * The upgrade URL this tab's socket is opened at.
 *
 * The tab names itself on the query string because a browser cannot put a
 * header on a WebSocket handshake, and the server derives the protocol
 * builder's lock owner from it: a tab that reconnects has to still be the
 * holder of the section it has open, and two tabs of one researcher have to be
 * two editors (#1275). `CLIENT_SESSION_PARAM` is the name the server reads it
 * under, so the two spellings cannot drift.
 */
export function hostSocketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${scheme}//${window.location.host}/ws`);
  url.searchParams.set(CLIENT_SESSION_PARAM, clientSessionId());
  return url.toString();
}

/**
 * One authenticated session's way of reaching the protocol builder's host.
 *
 * A session rather than a socket, because closing the socket does not end
 * either of the things that outlive a sign-out.
 *
 * The server reads the principal ONCE, at the upgrade
 * (`server/src/app.ts`), and authorises and audits every message on that
 * socket as them — so a socket still open when the next account signs in on
 * this tab is one they would be editing, and be logged, as the previous
 * researcher through.
 *
 * And the transport reconnects on its own schedule. A call that was in flight
 * at sign-out is parked inside `getConnectedPeer`, on a socket that is still
 * connecting or on the delay before the next attempt, and it wakes up after
 * the sign-out has been decided. Refusing to `connect` does not settle it: an
 * `RPCLink` with reconnection enabled swallows what `connect` throws and tries
 * again. So the refusal has to be permanent for THIS session — which is what
 * ending one means — and the next session is a transport of its own, which the
 * parked call has no way to reach.
 */
type HostSession = Readonly<{
  link: ClientLink<Record<never, never>>;
  /** Permanently. Nothing reopens a session; the next call opens another. */
  end: () => void;
}>;

/** The session in force, or none because nothing has needed one yet. */
let hostSession: HostSession | undefined;

/**
 * A transport for whoever is signed in now.
 *
 * Reconnection is the whole of what makes a dropped socket survivable, and it
 * is off by default in `@orpc/client`: without it the transport keeps the
 * closed peer and answers every later call from it, so one blip leaves the
 * editor unable to lock, save or watch anything until the page is reloaded —
 * and the host's lock-survival grace, which exists exactly for a tab that
 * comes back, can never be reached. Reopening lazily rather than `onClose`, so
 * that closing the socket at sign-out is not immediately undone.
 */
function openHostSession(): HostSession {
  let socket: WebSocket | undefined;
  let ended = false;
  const link = new RPCLink({
    connect: (): WebSocket => {
      // Refused rather than opened: a handshake is what authenticates, so a
      // socket opened here after the session ended is already the researcher
      // who left. `shell/useSignOut.ts` ends the editor's sessions BEFORE
      // `authClient.signOut()`, on purpose, so the cookie a reconnection
      // carried in this window would still work.
      if (ended) throw new Error('This tab’s editor session has ended.');
      socket = new WebSocket(hostSocketUrl());
      return socket;
    },
    reconnect: { enabled: true },
  });
  return {
    link,
    end: () => {
      ended = true;
      socket?.close();
      socket = undefined;
    },
  };
}

/**
 * The session every call goes through, opened by the first call to need one.
 *
 * Exported so the suite drives the same sessions the application runs on.
 */
export function currentHostSession(): HostSession {
  hostSession ??= openHostSession();
  return hostSession;
}

/**
 * The host client, whose link is the session in force at the moment of a call.
 *
 * One client for the life of the tab, because `ProtocolBuilder` memoises its
 * whole context on this identity and every lock in the editor is taken from an
 * effect keyed on it. `DynamicLink` is oRPC's own way of writing that: the
 * client is fixed and the link behind it is resolved per call, so ending a
 * session swaps the transport without any of the editor noticing a new object.
 */
const hostClient: StudioHostClient = createORPCClient(
  new DynamicLink(() => currentHostSession().link),
);

/**
 * Ending this tab's editor session.
 *
 * Registered at module scope rather than from the editor's own effect because
 * of when it is called: sign-out leaves the editor by an ordinary navigation
 * first, so the unsaved-changes blocker runs while the session is still valid,
 * and only then closes the editor's sessions — by which time the route is
 * unmounted and an effect's registration is gone with it.
 *
 * `closeStudioEditorSessions` is the one place this happens, and every way out
 * of an authenticated session calls it: `shell/useSignOut.ts`, the "use a
 * different account" sign-out on an invitation, and the app shell's guard,
 * which is where an expired session and a sign-out in another tab are learnt.
 *
 * Closing is also what gives the sections this tab was holding back to its
 * collaborators.
 */
registerStudioEditorSession(async () => {
  hostSession?.end();
  hostSession = undefined;
});

/** What `protocols.draft` and every editing procedure are addressed by. */
type DraftAddress = {
  teamId: string;
  protocolId: string;
  draftId: string;
};

type Selection =
  | { kind: 'stage'; stageId: string }
  | { kind: 'settings' | 'codebook' | 'assets' | 'translations' };

/**
 * What the study in the URL gives the editor to open, as far as this
 * researcher can see.
 *
 * Five answers rather than two, because "not yet", "not yours", "nothing to
 * edit" and "could not ask" are different things to put on screen, and
 * collapsing any pair of them is what leaves a researcher on a spinner that
 * will never resolve.
 */
type EditorTarget =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'unreachable' }
  | { status: 'noDraft' }
  | { status: 'found'; address: DraftAddress };

type DraftValidation =
  | Readonly<{ status: 'pending'; issues: readonly [] }>
  | Readonly<{ status: 'valid'; issues: readonly [] }>
  | Readonly<{
      status: 'invalid';
      issues: readonly Readonly<{
        path: readonly (string | number)[];
        message: string;
      }>[];
    }>;

const messages = defineMessages({
  openingEditor: {
    id: 'studio.editor.openingEditor',
    defaultMessage: 'Opening protocol editor…',
    description:
      'Screen-reader status announced while the protocol editor is still loading.',
  },
  studyUnavailable: {
    id: 'studio.editor.studyUnavailable',
    defaultMessage:
      'This study could not be opened. Reload the page and try again.',
    description:
      'Shown when the study the editor URL names could not be read at all.',
  },
  studyUnreachable: {
    id: 'studio.editor.studyUnreachable',
    defaultMessage:
      'This study is not one of yours. Ask whoever sent you the link to give you access to it.',
    description:
      'Shown when the researcher has no access to the study the editor URL names.',
  },
  studyWithoutDraft: {
    id: 'studio.editor.studyWithoutDraft',
    defaultMessage: 'This study has no protocol draft to edit.',
    description:
      'Shown when the study exists but carries no protocol draft for the editor to open.',
  },
  discardTitle: {
    id: 'studio.editor.discardTitle',
    defaultMessage: 'Discard unsaved screen changes?',
    description:
      'Title of the dialog asking whether to abandon unsaved values on the current interview screen.',
  },
  discardConfirm: {
    id: 'studio.editor.discardConfirm',
    defaultMessage: 'Discard changes',
    description:
      'Button that abandons the unsaved values on the current interview screen.',
  },
  keepEditing: {
    id: 'studio.editor.keepEditing',
    defaultMessage: 'Keep editing',
    description:
      'Button that dismisses the discard dialog and leaves the unsaved values in place.',
  },
  discardForSection: {
    id: 'studio.editor.discardForSection',
    defaultMessage:
      'The values in this screen have not been saved. Discard them and open another section?',
    description:
      'Body of the discard dialog when the researcher is opening another section of the protocol.',
  },
  discardForLeaving: {
    id: 'studio.editor.discardForLeaving',
    defaultMessage:
      'The values in this screen have not been saved. Discard them and leave the protocol editor?',
    description:
      'Body of the discard dialog when the researcher is navigating away from the editor.',
  },
  discardForNewScreen: {
    id: 'studio.editor.discardForNewScreen',
    defaultMessage:
      'The values in this screen have not been saved. Discard them and add a new screen?',
    description:
      'Body of the discard dialog when the researcher is adding another interview screen.',
  },
  draftUnavailable: {
    id: 'studio.editor.draftUnavailable',
    defaultMessage:
      'This protocol draft could not be opened. Return to protocols and try again.',
    description:
      'Shown when the protocol draft itself could not be loaded into the editor.',
  },
  draftEditor: {
    id: 'studio.editor.draftEditor',
    defaultMessage: 'Draft editor',
    description:
      'Supporting line under the protocol name, naming what this screen edits.',
  },
  protocolSections: {
    id: 'studio.editor.protocolSections',
    defaultMessage: 'Protocol sections',
    description:
      "Heading and accessible name of the editor's own section selector.",
  },
  settings: {
    id: 'studio.editor.settings',
    defaultMessage: 'Settings',
    description:
      "Section selector entry for the protocol's own settings section.",
  },
  screens: {
    id: 'studio.editor.screens',
    defaultMessage: 'Screens',
    description:
      'Section selector group holding the interview screens of the protocol.',
  },
  addScreen: {
    id: 'studio.editor.addScreen',
    defaultMessage: 'Add',
    description: 'Button that adds another interview screen to the protocol.',
  },
  addUnconfirmed: {
    id: 'studio.editor.addUnconfirmed',
    defaultMessage:
      'Studio could not confirm whether the screen was added. Refresh the outline before trying again.',
    description:
      'Shown when adding an interview screen failed without saying whether it was created.',
  },
  refreshOutline: {
    id: 'studio.editor.refreshOutline',
    defaultMessage: 'Refresh outline',
    description:
      'Button that re-reads the protocol after an unconfirmed screen addition.',
  },
  outlineRefreshFailedForAdd: {
    id: 'studio.editor.outlineRefreshFailedForAdd',
    defaultMessage:
      'The outline could not be refreshed. Reload this editor before adding another screen.',
    description:
      'Shown when re-reading the protocol after an unconfirmed screen addition also failed.',
  },
  moveUnconfirmed: {
    id: 'studio.editor.moveUnconfirmed',
    defaultMessage:
      'Studio could not confirm the new screen order. Refresh the outline before moving another screen.',
    description:
      'Shown when reordering interview screens failed without saying whether the new order was kept.',
  },
  refreshOrder: {
    id: 'studio.editor.refreshOrder',
    defaultMessage: 'Refresh order',
    description:
      'Button that re-reads the protocol after an unconfirmed screen reorder.',
  },
  outlineRefreshFailedForMove: {
    id: 'studio.editor.outlineRefreshFailedForMove',
    defaultMessage:
      'The outline could not be refreshed. Reload this editor before moving another screen.',
    description:
      'Shown when re-reading the protocol after an unconfirmed screen reorder also failed.',
  },
  noScreens: {
    id: 'studio.editor.noScreens',
    defaultMessage: 'Add a screen to begin the interview flow.',
    description: 'Shown when the protocol has no interview screens yet.',
  },
  defaultScreenName: {
    id: 'studio.editor.defaultScreenName',
    defaultMessage: 'Screen {number}',
    description:
      'Stands in for an interview screen the researcher has not named; {number} is its position in the interview, counting from one.',
  },
  unknownScreenType: {
    id: 'studio.editor.unknownScreenType',
    defaultMessage: 'Unknown screen',
    description:
      'Supporting line of an outline entry whose screen carries no recognisable type.',
  },
  moveScreenUp: {
    id: 'studio.editor.moveScreenUp',
    defaultMessage: 'Move {name} up',
    description:
      'Accessible name of the control that moves an interview screen one place earlier; {name} is the screen name.',
  },
  moveScreenDown: {
    id: 'studio.editor.moveScreenDown',
    defaultMessage: 'Move {name} down',
    description:
      'Accessible name of the control that moves an interview screen one place later; {name} is the screen name.',
  },
  codebook: {
    id: 'studio.editor.codebook',
    defaultMessage: 'Codebook',
    description:
      "Name of the protocol's codebook section, in the section selector and as the canvas heading.",
  },
  assets: {
    id: 'studio.editor.assets',
    defaultMessage: 'Assets',
    description:
      "Name of the protocol's assets section, in the section selector and as the canvas heading.",
  },
  translations: {
    id: 'studio.editor.translations',
    defaultMessage: 'Translations',
    description:
      "Name of the protocol's translations section, in the section selector and as the canvas heading.",
  },
  inspector: {
    id: 'studio.editor.inspector',
    defaultMessage: 'Inspector',
    description:
      'Heading of the panel listing the validation problems of the protocol being edited.',
  },
  validationProblems: {
    id: 'studio.editor.validationProblems',
    defaultMessage:
      '{count, plural, one {# validation problem} other {# validation problems}}',
    description:
      'Button reporting how many validation problems the protocol currently has.',
  },
  protocolValid: {
    id: 'studio.editor.protocolValid',
    defaultMessage: 'Protocol valid',
    description:
      'Button reporting that the protocol currently has no validation problems.',
  },
  checkingProtocol: {
    id: 'studio.editor.checkingProtocol',
    defaultMessage: 'Checking protocol',
    description: 'Button reporting that the protocol is still being validated.',
  },
  assemblyFailed: {
    id: 'studio.editor.assemblyFailed',
    defaultMessage: 'The protocol document could not be assembled.',
    description:
      'Validation problem shown when the draft could not be turned into a protocol document to check.',
  },
  saveScreen: {
    id: 'studio.editor.saveScreen',
    defaultMessage: 'Save screen',
    description: "Submit button of the interview screen's form.",
  },
  validationHeading: {
    id: 'studio.editor.validationHeading',
    defaultMessage: 'Validation',
    description:
      'Heading of the section listing the protocol’s validation problems.',
  },
  checkingThisProtocol: {
    id: 'studio.editor.checkingThisProtocol',
    defaultMessage: 'Checking this protocol…',
    description: 'Shown while the protocol is still being validated.',
  },
  noValidationProblems: {
    id: 'studio.editor.noValidationProblems',
    defaultMessage: 'No validation problems.',
    description: 'Shown when the protocol has no validation problems.',
  },
  protocolSettings: {
    id: 'studio.editor.protocolSettings',
    defaultMessage: 'Protocol settings',
    description:
      'Canvas heading of the section holding the settings of the protocol itself.',
  },
  settingsBody: {
    id: 'studio.editor.settingsBody',
    defaultMessage: 'Protocol metadata editing will use this canvas.',
    description:
      'Says what the protocol settings section will do once it is built.',
  },
  codebookBody: {
    id: 'studio.editor.codebookBody',
    defaultMessage:
      'People, connections, and participant variables will be managed here.',
    description: 'Says what the codebook section will do once it is built.',
  },
  assetsBody: {
    id: 'studio.editor.assetsBody',
    defaultMessage:
      'Images, audio, and video used by this protocol will be managed here.',
    description: 'Says what the assets section will do once it is built.',
  },
  translationsBody: {
    id: 'studio.editor.translationsBody',
    defaultMessage: 'Translated protocol content will be managed here.',
    description: 'Says what the translations section will do once it is built.',
  },
});

function stageLabel(
  intl: IntlShape,
  stage: StageSummary,
  index: number,
): string {
  return stage.label.trim() === ''
    ? intl.formatMessage(messages.defaultScreenName, { number: index + 1 })
    : stage.label;
}

/**
 * What `/study/$studyId/editor` opens, resolved from the study id itself
 * rather than from whichever team the researcher was last acting in.
 *
 * **`$studyId` is authoritative** (§2.2, §5.6): a study URL is a canonical
 * link, and it has to open the study whoever follows it and however they got
 * there. Reading the ACTIVE team instead makes that false in two ways, both
 * reachable from an ordinary bookmark. A direct visit to team B's study while
 * the setting still names team A asks A's list, does not find it and reports
 * the study unavailable; and a session that names no team at all — which is
 * every first sign-in, since nothing sets `activeOrganizationId` when a
 * session is created — has nothing to ask, so the screen never resolves at
 * all. §6.6's reconciler cannot help: a study route names no team, so it
 * leaves the setting wherever the last team route left it.
 *
 * **One question, answered by the server.** `studies.get` takes the study id
 * alone and derives the tenant from the caller's own memberships (§6.3), and
 * it carries both halves the editing procedures need beyond the study: the
 * owning team, and the current draft of the study's protocol line. This
 * replaces asking every team the researcher belongs to for its own list, and
 * with it the assumption that a study id IS a protocol id.
 *
 * A refusal is `unreachable` and anything else is `unavailable`: FORBIDDEN is
 * the server's one answer for a study that is absent, in another team, or not
 * shown to this researcher's role, while an outage is no basis for a claim
 * about their access.
 */
function useEditorTarget(studyId: string): EditorTarget {
  const study = useQuery(orpc.studies.get.queryOptions({ input: { studyId } }));

  if (study.isPending) return { status: 'pending' };
  if (study.isError) {
    return {
      status:
        study.error instanceof ORPCError && study.error.code === 'FORBIDDEN'
          ? 'unreachable'
          : 'unavailable',
    };
  }
  const { teamId, study: row, protocolDraftId } = study.data;
  if (row.protocolId === null || protocolDraftId === null) {
    return { status: 'noDraft' };
  }
  return {
    status: 'found',
    address: { teamId, protocolId: row.protocolId, draftId: protocolDraftId },
  };
}

/**
 * The protocol editor, at `/study/$studyId/editor` (§5.2, #1272).
 *
 * The editing procedures are addressed by `{ teamId, protocolId, draftId }`
 * and the URL carries only `$studyId`; `useEditorTarget` above turns one into
 * the other. A study this researcher cannot reach, and a study with no draft
 * to edit, are the two answers that leave nothing to open, and each says which
 * it is.
 */
export default function Editor() {
  const intl = useAppIntl();
  const { studyId } = route.useParams();
  const target = useEditorTarget(studyId);

  if (target.status === 'pending') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
        <span className="sr-only">
          {intl.formatMessage(messages.openingEditor)}
        </span>
      </div>
    );
  }

  if (target.status === 'unavailable') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          {intl.formatMessage(messages.studyUnavailable)}
        </Alert>
      </div>
    );
  }

  if (target.status !== 'found') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          {intl.formatMessage(
            target.status === 'unreachable'
              ? messages.studyUnreachable
              : messages.studyWithoutDraft,
          )}
        </Alert>
      </div>
    );
  }

  return <ProtocolEditor address={target.address} />;
}

/**
 * What has to be answered before the editor can be opened at all: that this
 * researcher's draft is there, and what it is called.
 *
 * The one thing `protocols.draft` is still asked for. Everything the editor
 * then draws — the screens, their names, the validation, which screen it opens
 * on, the revision a reorder is fenced on — comes from the protocol the
 * package holds, which one channel keeps current (#1810). Two readings of one
 * protocol is what left a collaborator's work off this screen until something
 * unrelated happened to refetch.
 */
function ProtocolEditor({ address }: { address: DraftAddress }) {
  const intl = useAppIntl();
  const draft = useQuery(orpc.protocols.draft.queryOptions({ input: address }));

  if (draft.isPending) {
    return (
      // The `<main id="main-content">` is the area layout's (§5.3, §7.1):
      // `AppFrame` renders the skip link and `AppArea` the landmark it
      // targets. These three branches are mutually exclusive, but each one
      // used to declare a second `<main>` with the same id inside the area's.
      <div className="flex h-full items-center justify-center">
        <Spinner />
        <span className="sr-only">
          {intl.formatMessage(messages.openingEditor)}
        </span>
      </div>
    );
  }
  if (!draft.data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          {intl.formatMessage(messages.draftUnavailable)}
        </Alert>
      </div>
    );
  }

  return (
    <ProtocolBuilder
      client={hostClient.protocolBuilder}
      protocolId={address.protocolId}
    >
      <EditorWorkspace
        address={address}
        protocolName={draft.data.protocol.name}
      />
    </ProtocolBuilder>
  );
}

/**
 * The editor itself, inside the protocol the package holds.
 *
 * Inside rather than around it because everything here reads that protocol:
 * the package's hooks are observers on its cache, and the channel feeding it
 * is what carries a collaborator's screen, rename, deletion or reorder onto
 * this screen without anything here asking for it again.
 */
function EditorWorkspace({
  address,
  protocolName,
}: {
  address: DraftAddress;
  protocolName: string;
}) {
  const intl = useAppIntl();
  const params = address;
  const { confirm } = useDialog();
  const [selection, setSelection] = useState<Selection>({ kind: 'settings' });
  const [stageFormDirty, setStageFormDirty] = useState(false);
  const [reconcilingAdd, setReconcilingAdd] = useState(false);
  const [addRecoveryFailed, setAddRecoveryFailed] = useState(false);
  const [reconcilingMove, setReconcilingMove] = useState(false);
  const [moveRecoveryFailed, setMoveRecoveryFailed] = useState(false);
  const selectionInitialized = useRef(false);
  const discardRequestPending = useRef(false);
  const stages = useStageIndex();
  const sections = useCompleteProtocolSections();
  const revision = useProtocolRevision();
  const rereadProtocol = useRereadProtocol();
  const draftValidation = useDraftValidation(sections);

  const confirmDiscardStageChanges = useCallback(
    // `confirm` takes plain strings, so the descriptors are formatted here
    // rather than teaching the shared dialog API about message descriptors.
    async (description: MessageDescriptor) => {
      if (discardRequestPending.current) return false;

      discardRequestPending.current = true;
      try {
        const result = await confirm({
          title: intl.formatMessage(messages.discardTitle),
          description: intl.formatMessage(description),
          confirmLabel: intl.formatMessage(messages.discardConfirm),
          cancelLabel: intl.formatMessage(messages.keepEditing),
          intent: 'destructive',
          onConfirm: () => undefined,
        });
        return result === true;
      } finally {
        discardRequestPending.current = false;
      }
    },
    [confirm, intl],
  );

  const requestSelection = useCallback(
    async (nextSelection: Selection) => {
      const unchanged =
        nextSelection.kind === selection.kind &&
        (nextSelection.kind !== 'stage' ||
          (selection.kind === 'stage' &&
            nextSelection.stageId === selection.stageId));
      if (unchanged) return;

      if (
        stageFormDirty &&
        !(await confirmDiscardStageChanges(messages.discardForSection))
      ) {
        return;
      }

      setSelection(nextSelection);
    },
    [confirmDiscardStageChanges, selection, stageFormDirty],
  );

  const shouldBlockNavigation = useCallback(async () => {
    if (!stageFormDirty) return false;

    const shouldDiscard = await confirmDiscardStageChanges(
      messages.discardForLeaving,
    );
    return !shouldDiscard;
  }, [confirmDiscardStageChanges, stageFormDirty]);

  useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: stageFormDirty,
    disabled: !stageFormDirty,
  });

  // Once, and only once the whole protocol has been read: a protocol that has
  // no screens when it is opened stays on its settings, and the screen a
  // collaborator adds minutes later is theirs rather than something this
  // editor is moved to. A reading still missing sections would open on
  // whichever screen happened to arrive first.
  useEffect(() => {
    if (sections === undefined || selectionInitialized.current) return;
    selectionInitialized.current = true;
    const firstStage = stages[0];
    if (firstStage !== undefined) {
      setSelection({ kind: 'stage', stageId: firstStage.id });
    }
  }, [sections, stages]);

  const selectedStageId = selection.kind === 'stage' ? selection.stageId : null;

  const addStage = useMutation({
    mutationFn: async () => {
      const stageId = createUuid();
      await rpcClient.protocols.addInformationStage({ ...params, stageId });
      return stageId;
    },
    onSuccess: async (stageId) => {
      await rereadProtocol();
      // Dirty changes were confirmed before the server mutation. Selecting
      // directly avoids asking again after the new screen already exists.
      setSelection({ kind: 'stage', stageId });
    },
  });
  const moveStage = useMutation({
    mutationFn: async (input: {
      stageId: string;
      toIndex: number;
      expectedRevision: bigint;
    }) =>
      rpcClient.protocols.moveStage({
        ...params,
        stageId: input.stageId,
        toIndex: input.toIndex,
        expectedRevision: String(input.expectedRevision),
      }),
    onSuccess: rereadProtocol,
  });

  // The order this move is expressed against is the one on screen, so the
  // revision it is fenced on has to be the one that drew it — the newest the
  // channel has delivered. Quoting a revision from a reading of the draft made
  // somewhere else is how a move computed from THIS order was accepted against
  // another one.
  const requestMoveStage = (stageId: string, toIndex: number) => {
    if (revision === undefined) return;
    moveStage.mutate({ stageId, toIndex, expectedRevision: revision });
  };

  const reconcileAddStage = async () => {
    setReconcilingAdd(true);
    setAddRecoveryFailed(false);
    try {
      await rereadProtocol();
      addStage.reset();
    } catch {
      setAddRecoveryFailed(true);
    } finally {
      setReconcilingAdd(false);
    }
  };

  const reconcileMoveStage = async () => {
    setReconcilingMove(true);
    setMoveRecoveryFailed(false);
    try {
      await rereadProtocol();
      moveStage.reset();
    } catch {
      setMoveRecoveryFailed(true);
    } finally {
      setReconcilingMove(false);
    }
  };

  const requestAddStage = async () => {
    if (
      stageFormDirty &&
      !(await confirmDiscardStageChanges(messages.discardForNewScreen))
    ) {
      return;
    }

    addStage.mutate();
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-surface-1 flex flex-wrap items-center justify-between gap-4 border-y px-4 py-3">
        {/*
            No way-out control here: the area's outline owns "Back to study" and
            the header owns the team and study chips (§5.5). A second back
            affordance inside `<main>` would be a third answer to the same
            question, and the two would not even agree on where "back" is.
          */}
        <div className="min-w-0">
          <Heading
            className="truncate"
            level="h1"
            margin="none"
            {...routeFocusTargetProps}
          >
            {protocolName}
          </Heading>
          <Paragraph className="text-sm" margin="none">
            {intl.formatMessage(messages.draftEditor)}
          </Paragraph>
        </div>
        <ValidationButton validation={draftValidation} />
      </div>

      <div className="laptop:grid-cols-[minmax(15rem,1fr)_minmax(24rem,2.5fr)_minmax(16rem,1fr)] grid min-h-0 flex-1 grid-cols-1 gap-4 p-4">
        <aside aria-labelledby="outline-heading" className="min-h-0">
          <Surface className="flex h-full min-h-0 flex-col" spacing="sm">
            {/*
                "Protocol sections", not "Protocol outline": the area's sidebar
                is the outline (§5.5), and two regions on one screen carrying
                one name is two things a screen reader cannot tell apart. This
                one is the editor's own section selector, inside `<main>`, and
                #1272 is what eventually merges the two.
              */}
            <Heading id="outline-heading" level="h2">
              {intl.formatMessage(messages.protocolSections)}
            </Heading>
            <nav
              aria-label={intl.formatMessage(messages.protocolSections)}
              className="min-h-0 overflow-y-auto"
            >
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <OutlineButton
                  selected={selection.kind === 'settings'}
                  onClick={() => void requestSelection({ kind: 'settings' })}
                >
                  {intl.formatMessage(messages.settings)}
                </OutlineButton>
                <li>
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <span className="font-heading font-bold">
                      {intl.formatMessage(messages.screens)}
                    </span>
                    <Button
                      size="sm"
                      variant="text"
                      icon={<Plus aria-hidden="true" />}
                      disabled={
                        addStage.isPending || addStage.isError || reconcilingAdd
                      }
                      onClick={() => void requestAddStage()}
                    >
                      {intl.formatMessage(messages.addScreen)}
                    </Button>
                  </div>
                  {addStage.isError && (
                    <Alert className="mb-2" variant="destructive">
                      <Paragraph margin="none">
                        {intl.formatMessage(messages.addUnconfirmed)}
                      </Paragraph>
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        disabled={reconcilingAdd}
                        onClick={() => void reconcileAddStage()}
                      >
                        {intl.formatMessage(messages.refreshOutline)}
                      </Button>
                      {addRecoveryFailed && (
                        <Paragraph className="mt-2" margin="none">
                          {intl.formatMessage(
                            messages.outlineRefreshFailedForAdd,
                          )}
                        </Paragraph>
                      )}
                    </Alert>
                  )}
                  {moveStage.isError && (
                    <Alert className="mb-2" variant="destructive">
                      <Paragraph margin="none">
                        {intl.formatMessage(messages.moveUnconfirmed)}
                      </Paragraph>
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        disabled={reconcilingMove}
                        onClick={() => void reconcileMoveStage()}
                      >
                        {intl.formatMessage(messages.refreshOrder)}
                      </Button>
                      {moveRecoveryFailed && (
                        <Paragraph className="mt-2" margin="none">
                          {intl.formatMessage(
                            messages.outlineRefreshFailedForMove,
                          )}
                        </Paragraph>
                      )}
                    </Alert>
                  )}
                  {stages.length === 0 ? (
                    <Paragraph className="px-2 text-sm">
                      {intl.formatMessage(messages.noScreens)}
                    </Paragraph>
                  ) : (
                    <ol className="m-0 flex list-none flex-col gap-2 p-0 ps-3">
                      {stages.map((stage, index) => {
                        return (
                          <li
                            key={stage.id}
                            className="flex min-w-0 items-center gap-1"
                          >
                            <button
                              type="button"
                              className="focusable aria-current:bg-selected aria-current:text-selected-contrast min-w-0 flex-1 rounded px-3 py-2 text-start"
                              aria-current={
                                selectedStageId === stage.id
                                  ? 'page'
                                  : undefined
                              }
                              onClick={() =>
                                void requestSelection({
                                  kind: 'stage',
                                  stageId: stage.id,
                                })
                              }
                            >
                              <span className="block truncate">
                                {stageLabel(intl, stage, index)}
                              </span>
                              <span className="block truncate text-xs opacity-70">
                                {stage.type === ''
                                  ? intl.formatMessage(
                                      messages.unknownScreenType,
                                    )
                                  : stage.type}
                              </span>
                            </button>
                            <div className="flex shrink-0 flex-col">
                              <button
                                type="button"
                                className="focusable rounded p-1 disabled:opacity-30"
                                aria-label={intl.formatMessage(
                                  messages.moveScreenUp,
                                  { name: stageLabel(intl, stage, index) },
                                )}
                                disabled={
                                  index === 0 ||
                                  moveStage.isPending ||
                                  moveStage.isError ||
                                  reconcilingMove
                                }
                                onClick={() =>
                                  requestMoveStage(stage.id, index - 1)
                                }
                              >
                                <ArrowUp aria-hidden="true" size={16} />
                              </button>
                              <button
                                type="button"
                                className="focusable rounded p-1 disabled:opacity-30"
                                aria-label={intl.formatMessage(
                                  messages.moveScreenDown,
                                  { name: stageLabel(intl, stage, index) },
                                )}
                                disabled={
                                  index === stages.length - 1 ||
                                  moveStage.isPending ||
                                  moveStage.isError ||
                                  reconcilingMove
                                }
                                onClick={() =>
                                  requestMoveStage(stage.id, index + 1)
                                }
                              >
                                <ArrowDown aria-hidden="true" size={16} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </li>
                <OutlineButton
                  selected={selection.kind === 'codebook'}
                  onClick={() => void requestSelection({ kind: 'codebook' })}
                >
                  {intl.formatMessage(messages.codebook)}
                </OutlineButton>
                <OutlineButton
                  selected={selection.kind === 'assets'}
                  onClick={() => void requestSelection({ kind: 'assets' })}
                >
                  {intl.formatMessage(messages.assets)}
                </OutlineButton>
                <OutlineButton
                  selected={selection.kind === 'translations'}
                  onClick={() =>
                    void requestSelection({ kind: 'translations' })
                  }
                >
                  {intl.formatMessage(messages.translations)}
                </OutlineButton>
              </ul>
            </nav>
          </Surface>
        </aside>

        <div className="min-h-[24rem]">
          <Surface className="h-full" spacing="lg">
            {selection.kind === 'stage' ? (
              <StageEditor
                target={{
                  sectionId: sectionId({
                    kind: 'stage',
                    stageId: selection.stageId,
                  }),
                }}
                actions={(context) => (
                  <StageActions
                    context={context}
                    onDirtyChange={setStageFormDirty}
                  />
                )}
              />
            ) : (
              <SectionPlaceholder kind={selection.kind} />
            )}
          </Surface>
        </div>

        <aside
          id="protocol-problems"
          aria-labelledby="inspector-heading"
          tabIndex={-1}
          className="min-h-0"
        >
          <Surface className="h-full" spacing="sm">
            <Heading id="inspector-heading" level="h2">
              {intl.formatMessage(messages.inspector)}
            </Heading>
            <ProtocolProblems validation={draftValidation} />
          </Surface>
        </aside>
      </div>
    </div>
  );
}

function OutlineButton(props: {
  selected: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className="focusable aria-current:bg-selected aria-current:text-selected-contrast w-full rounded px-3 py-2 text-start"
        aria-current={props.selected ? 'page' : undefined}
        onClick={() => props.onClick()}
      >
        {props.children}
      </button>
    </li>
  );
}

/**
 * Studio's own chrome for the stage the package is editing.
 *
 * The action slot renders inside the editor's form store, which is the only
 * place the screen's unsaved state can be read from: the form belongs to
 * `@codaco/protocol-builder`, while the discard dialog and the navigation
 * blocker that consume this belong to the route.
 */
function StageActions(props: {
  context: StageEditorActionContext;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const intl = useAppIntl();
  const dirty = useFormStore(selectIsFormDirty);
  const { onDirtyChange } = props;

  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  return (
    <div className="flex justify-end">
      <SubmitButton
        form={props.context.formId}
        disabled={props.context.readOnly}
      >
        {intl.formatMessage(messages.saveScreen)}
      </SubmitButton>
    </div>
  );
}

function ValidationButton(props: { validation: DraftValidation }) {
  const intl = useAppIntl();
  const { validation } = props;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => document.getElementById('protocol-problems')?.focus()}
    >
      {validation.status === 'invalid'
        ? intl.formatMessage(messages.validationProblems, {
            count: validation.issues.length,
          })
        : intl.formatMessage(
            validation.status === 'valid'
              ? messages.protocolValid
              : messages.checkingProtocol,
          )}
    </Button>
  );
}

function useDraftValidation(
  sections: Readonly<Record<string, SectionDoc>> | undefined,
): DraftValidation {
  const intl = useAppIntl();
  const [validation, setValidation] = useState<DraftValidation>({
    status: 'pending',
    issues: [],
  });

  useEffect(() => {
    let active = true;
    if (sections === undefined) {
      setValidation({ status: 'pending', issues: [] });
      return () => {
        active = false;
      };
    }

    setValidation({ status: 'pending', issues: [] });
    void (async () => {
      try {
        const result = await CurrentProtocolSchema.safeParseAsync(
          assembleProtocolSections(sections),
        );
        if (!active) return;
        setValidation(
          result.success
            ? { status: 'valid', issues: [] }
            : {
                status: 'invalid',
                issues: result.error.issues.map(toDraftValidationIssue),
              },
        );
      } catch (error) {
        if (!active) return;
        setValidation({
          status: 'invalid',
          issues: [
            {
              path: [],
              message:
                error instanceof Error
                  ? error.message
                  : intl.formatMessage(messages.assemblyFailed),
            },
          ],
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [intl, sections]);

  return validation;
}

function toDraftValidationIssue(
  issue: Readonly<{ path: readonly PropertyKey[]; message: string }>,
): Readonly<{ path: readonly (string | number)[]; message: string }> {
  return {
    path: issue.path.map((segment) =>
      typeof segment === 'symbol' ? String(segment) : segment,
    ),
    message: issue.message,
  };
}

function ProtocolProblems(props: { validation: DraftValidation }) {
  const intl = useAppIntl();
  return (
    <section aria-labelledby="validation-heading">
      <Heading id="validation-heading" level="h3">
        {intl.formatMessage(messages.validationHeading)}
      </Heading>
      {props.validation.status === 'pending' && (
        <Paragraph>
          {intl.formatMessage(messages.checkingThisProtocol)}
        </Paragraph>
      )}
      {props.validation.status === 'valid' && (
        <Paragraph>
          {intl.formatMessage(messages.noValidationProblems)}
        </Paragraph>
      )}
      {props.validation.status === 'invalid' && (
        <ul className="list-disc space-y-2 ps-5">
          {props.validation.issues.map((issue, index) => (
            <li key={`${issue.path.join('.')}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionPlaceholder(props: {
  kind: Exclude<Selection['kind'], 'stage'>;
}) {
  const intl = useAppIntl();
  // The three section names the outline also carries are one descriptor each:
  // the entry and the canvas heading name the same section, and translating
  // them apart would let a researcher's way in disagree with where it landed.
  const content = {
    settings: {
      heading: messages.protocolSettings,
      body: messages.settingsBody,
    },
    codebook: {
      heading: messages.codebook,
      body: messages.codebookBody,
    },
    assets: {
      heading: messages.assets,
      body: messages.assetsBody,
    },
    translations: {
      heading: messages.translations,
      body: messages.translationsBody,
    },
  }[props.kind];
  return (
    <>
      <Heading level="h2">{intl.formatMessage(content.heading)}</Heading>
      <Paragraph>{intl.formatMessage(content.body)}</Paragraph>
    </>
  );
}
