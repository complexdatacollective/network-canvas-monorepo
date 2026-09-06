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

import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import type { Codebook, StageType } from '@codaco/protocol-validation';
import type { Command, SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { InMemoryCompoundHost } from '../compound-edit/InMemoryCompoundHost.ts';
import { useStageEditorController } from '../controller.ts';
import StageEditorShell from '../form/StageEditorShell.tsx';
import { getInterfaceTemplate } from '../interfaces/templates.ts';
import { protocolBuilderCatalogs } from '../locales/catalogs.ts';
import { protocolContextFromSections } from '../protocol-context.ts';
import type { InMemoryResourceGateway } from '../resources/InMemoryResourceGateway.ts';
import type {
  FinishRequest,
  PendingCommandBatch,
  ProtocolBuilderSessionStore,
} from '../session.ts';
import type {
  StageEditorActions,
  StageEditorComponent,
  StageEditorRegistry,
} from '../stage-editor-contract.ts';
import StageEditor from '../StageEditor.tsx';
import {
  FIXTURE_SESSION_OWNER,
  openFixtureStageSession,
  type SeededStage,
} from './fixtureSession.ts';
import { loadFixtureStage } from './protocolFixture.ts';

const DEFAULT_SUBMIT_LABEL = 'Save stage';

/** DOM id of the stage form the harness mounts. See `HarnessEditor`. */
const STAGE_FORM_ID = 'stage-form';

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
    /**
     * Applies a codebook change as if another session had made it.
     *
     * It reaches the HOST first, which issues the revision for it, and the
     * session is then told about it under that same revision — so this is one
     * change to one protocol, seen from both ends, rather than a story the
     * session alone has been told. A later compound edit touching what was
     * seeded is therefore built on a base the host recognises and is accepted;
     * before this went to the host, every such edit was refused as stale, and
     * a family test that needed a seeded attribute had to drive the create
     * dialog to get one.
     *
     * See `receiveConflictingCodebookUpdate` for the arrival the host has NOT
     * accepted.
     */
    receiveCodebookUpdate(patch: CodebookPatch): void;
    /**
     * Tells the SESSION ALONE about a codebook change, under a revision the
     * host never issued.
     *
     * The escape hatch for the one scenario the honest path cannot produce: a
     * session whose base has moved out from under the host, where the next
     * compound edit must be refused as `stale-base`. It is named rather than a
     * flag because it leaves the harness lopsided on purpose — the host is
     * behind the session from here on, `hostCodebook()` will not show what was
     * seeded, and `receiveCodebookUpdate` afterwards throws rather than let the
     * session silently drop an arrival whose revision it has already passed.
     */
    receiveConflictingCodebookUpdate(patch: CodebookPatch): void;
    /**
     * The codebook as the HOST holds it, read the way an editor reads one.
     *
     * The session's copy answers "what was this editor told?"; this answers
     * "what does the protocol actually hold?" — the only way to prove that
     * something an editor did (or refused to do) reached the codebook, or that
     * nothing did.
     */
    hostCodebook(): Readonly<Codebook>;
    /** Every local batch the authoritative protocol has not acknowledged. */
    pendingCommands(): readonly PendingCommandBatch[];
    /**
     * Every command a host applying this session's edits LIVE has been given,
     * in the order it was given them.
     *
     * Most of what an editor does reaches such a host the moment it is done,
     * and the session decides which edits may not: one naming a resource
     * staged in this session, and everything after it, waits for the finish
     * that promotes the file. So this is what a cancelled edit LEFT BEHIND —
     * the one thing `pendingCommands` cannot say, because a batch that has
     * gone to the host is pending there too until it is acknowledged.
     *
     * Empty unless the harness was opened with `applyLive`, which is what
     * puts a live host under it at all.
     */
    liveCommands(): readonly Command[];
    /**
     * The top-level stage keys the mounted sections have a field for.
     *
     * Read from the fields themselves — `data-field-path` is the canonical key
     * the form store files a field under, the same string `ProtocolField`
     * registers with the outline — and scoped to the stage form, so a row
     * dialog's own fields (which belong to a form of their own, in a portal)
     * are not mistaken for the stage's.
     */
    ownedKeys(): string[];
    /**
     * Saves the stage unchanged and proves it came back the same stage.
     *
     * The one test every named editor owes the schema, and it is two claims,
     * because a key can be lost in two different ways.
     *
     * A key the editor RENDERS can be dropped, altered or INVENTED by the save
     * itself, which the comparison against the seeded stage catches. The
     * comparison runs in both directions and all the way down: a key the
     * editor drops, a nested key a control defaults away, and a key nothing
     * authored that the editor stamps on anyway are the same failure seen from
     * three sides, and each is reported by its own path
     * (`mapOptions.showTransit`, `prompts[0].id`). An invented key matters as
     * much as a lost one — it is content in the researcher's protocol that the
     * researcher did not write.
     *
     * A key NO section renders is a quieter failure: it survives the round trip
     * untouched, by design — an interface with no `skipLogic` section must not
     * delete skip logic someone authored — so a comparison can never see it.
     * The editor is simply missing a section, and a researcher who opens the
     * stage cannot see or change something their protocol holds.
     *
     * So an unrendered key has to be declared. `unowned` is where an editor
     * says "this interface's schema has this key and nothing here edits it
     * yet", one key at a time, in a list a reviewer can read.
     */
    roundTrip(
      options?: Readonly<{
        /**
         * TOP-LEVEL keys the mounted sections deliberately do not own. Every
         * other key of the seeded stage must be owned by a mounted section.
         *
         * Top-level only, and it needs to be nothing more: a key inside one
         * the editor does render cannot go unnoticed, because the comparison
         * below reaches it. `unowned` answers "is there a section for this at
         * all?", which is a question about the editor's outline; what happens
         * inside a key a section does own is a question about the save, and
         * the diff answers that one.
         */
        unowned?: readonly string[];
      }>,
    ): Promise<FinishRequest>;
    /** The section outline, in the order it is rendered. */
    outline(): { title: string; state: string }[];
    /** Takes editing away from this session, or gives it back. */
    setReadOnly(readOnly?: boolean): void;
  }>;

export type RenderStageEditorOptions<T extends StageType = StageType> =
  Readonly<{
    /** Open this stage of the shared all-interfaces protocol. */
    stageId?: string;
    /** Or open a stage of this type holding these fields. */
    stage?: Readonly<{ id?: string; type: T; fields: SectionDoc }>;
    /**
     * Or CREATE a stage of this type, the way a host opens a new one: it starts
     * from the interface's own template, it is not in the interview yet, and
     * `position` is where the host will insert it, counting from zero.
     *
     * The session is opened with that creation, so everything a section derives
     * from it — the proposed name, the destinations a skip may continue at — is
     * exercised here exactly as it will be in the host.
     */
    create?: Readonly<{
      type: T;
      position: number;
      /** Fields on top of the interface's template. */
      fields?: SectionDoc;
    }>;
    /**
     * The named editor under test, which brings its own shell.
     *
     * Typed for the stage this call opens rather than for every stage type, so
     * a narrowly typed family editor — `StageEditorComponent<'Information'>` —
     * is accepted directly. A component's props are contravariant, so the wide
     * slot this used to be refused exactly the editors the harness exists to
     * mount, and families had to go through `registry` to get around it.
     *
     * `stage` and `create` name the interface in the same call, so pairing one
     * of them with an editor written for a different interface does not
     * compile.
     *
     * Exactly one of `editor` and `sections` is given. Neither means the
     * package's own dispatcher chooses, which is how a registry is tested.
     */
    editor?: StageEditorComponent<T>;
    /** Or the sections under test, which the harness puts in the shared shell. */
    sections?: ReactNode;
    /** The editors the dispatcher chooses from, when neither of the above is given. */
    registry?: Partial<StageEditorRegistry>;
    /**
     * Extra manifest entries this stage may reference, keyed by asset id.
     *
     * They join the fixture's own assets in BOTH places a resource has to exist
     * to be referenced — the protocol's manifest section and the gateway — so a
     * stage seeded with a reference to one is a stage a host would accept,
     * rather than one whose save is refused for a dangling reference.
     */
    assets?: Readonly<Record<string, SectionDoc>>;
    /**
     * The host's action chrome, as a host would give it to the editor.
     *
     * Given, it is what gets rendered in the editor's slot, whichever of the
     * three ways above mounted it. Left out, an editor or a registry is
     * mounted with no chrome at all — a named editor under test usually brings
     * its own save control for the harness to click — while `sections` keeps
     * the harness's own submit button, which is the only control that path has.
     */
    actions?: StageEditorActions;
    /** Accessible name of the control that saves the stage. */
    submitLabel?: string;
    /** Open the stage as a spectator. */
    readOnly?: boolean;
    /**
     * Read the editor in this language.
     *
     * Left out, NO provider is mounted at all, `useAppIntl()` falls back to a
     * shared English formatter over no catalog, and every descriptor renders
     * its own `defaultMessage`. That is what lets the several hundred English
     * assertions in this package's suite stand unchanged through the
     * conversion, and it is deliberate rather than incidental: a harness that
     * always mounted a provider would make every one of them a test of the
     * catalog as well as of the component.
     *
     * Given, the same three catalogs a host merges are merged in the same
     * order, so a locale-parity test proves the wiring a host will actually
     * have. `manageDocument` is off: a test must not rewrite the jsdom
     * document's own language out from under the rest of the suite.
     */
    locale?: string;
    /**
     * Sections another editor is holding, named by who is holding them, so a
     * change that needs one is blocked rather than applied.
     */
    heldSections?: readonly Readonly<{
      sectionId: ProtocolSectionId;
      displayName: string;
    }>[];
    /**
     * Open the stage over a host that applies each batch as it is made,
     * instead of the buffering one that is handed nothing until the finish.
     *
     * Off by default, because a buffering host is what almost every test here
     * wants: an editor draws work in progress — a row added before anything
     * has been typed into it, a capability cleared before the field replacing
     * it is filled in — and a host holding that would refuse the very next
     * compound edit for a protocol the researcher has not finished writing.
     *
     * On, `host` really holds every batch it is handed, which is the only
     * honest way to claim delivery: the session reads a host's later answers
     * against what it was GIVEN (`deliveredPrefixLength`), so a port that
     * recorded a batch and left the host where it was made the session read
     * its own unsaved work as a collaborator's edit and retire it. Turn it on
     * for what only a live host can be asked — see `liveCommands`.
     */
    applyLive?: boolean;
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
/**
 * Mounts a provider only when a test asks for one.
 *
 * Without a locale there is deliberately no provider in the tree at all —
 * see `RenderStageEditorOptions.locale` — so this renders its children
 * untouched rather than mounting an English one, which would be a different
 * thing: a provider carries a catalog, and an English one over the merged
 * catalogs is not the same as no catalog at all.
 */
function LocaleFrame({
  locale,
  children,
}: Readonly<{ locale?: string; children: ReactNode }>) {
  if (locale === undefined) return children;
  return (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={mergeCatalogs(
        commonCatalogs[locale] ?? {},
        frescoUiCatalogs[locale] ?? {},
        protocolBuilderCatalogs[locale] ?? {},
      )}
      manageDocument={false}
    >
      {children}
    </AppI18nProvider>
  );
}

export function renderStageEditor<T extends StageType = StageType>(
  options: RenderStageEditorOptions<T> = {},
): StageEditorHarness {
  const seeded = seedFrom(options);
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const finishRequests: FinishRequest[] = [];
  // What a host applying this session's edits live has been handed, for a
  // harness opened with `applyLive`. `host` really applies them: claiming
  // delivery without holding the batch is a host the session cannot read —
  // see the option.
  const liveCommands: Command[] = [];
  // The same session a story is opened over, built once in `fixtureSession`:
  // a test and a story that assembled the protocol differently would disagree
  // about what the editor is mounted over.
  const { session, host, gateway } = openFixtureStageSession({
    seeded,
    ...(options.assets === undefined ? {} : { assets: options.assets }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    ...(options.heldSections === undefined
      ? {}
      : { heldSections: options.heldSections }),
    ...(options.applyLive === true
      ? {
          onCommands: (batch: PendingCommandBatch) => {
            liveCommands.push(...batch.commands);
          },
        }
      : {}),
    onFinish: (request) => {
      finishRequests.push(request);
    },
  });

  const submitLabel = options.submitLabel ?? DEFAULT_SUBMIT_LABEL;
  const view = render(
    <LocaleFrame
      {...(options.locale === undefined ? {} : { locale: options.locale })}
    >
      <DialogProvider>
        <HarnessEditor
          session={session}
          submitLabel={submitLabel}
          {...(options.actions === undefined
            ? {}
            : { actions: options.actions })}
          {...(options.editor === undefined ? {} : { editor: options.editor })}
          {...(options.sections === undefined
            ? {}
            : { sections: options.sections })}
          {...(options.registry === undefined
            ? {}
            : { registry: options.registry })}
        />
      </DialogProvider>
    </LocaleFrame>,
  );

  // No wait between keystrokes. user-event's default schedules a real 0ms
  // timer per key, and a timer is a turn of the event loop rather than
  // nothing: a section editor's tests type whole questions and attribute
  // names, so the suite spends real seconds waiting on nothing.
  //
  // `null` is not the same as `0`, which still schedules. Nothing here needs
  // the gap: what a debounce or a delayed validation is waiting for is time,
  // not keystrokes, and a test that needs it must await the thing itself —
  // an assertion that only passed because the typing was slow is an assertion
  // about the harness.
  //
  // What it costs is worth saying plainly: with the turn gone, nothing that
  // waits for one runs BETWEEN two keystrokes. A passive effect, a microtask
  // chain or a timer that a real typist's fingers would have let through
  // arrives here only after the whole string is in — so these tests exercise
  // one scheduling of a change, not the one a person produces.
  //
  // The one turn of the event loop that IS needed — the one between `type`'s
  // own click and the keystrokes that follow it — is given below.
  const keyboard = userEvent.setup({ delay: null });
  const user = withSafeTypingIntoRichText(keyboard);
  // Only fabricated revisions are numbered here. A real seeded change takes
  // the number the host gives it.
  let fabrications = 0n;

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
    // Answered against the count taken before the click, never `at(-1)`: after
    // one save has succeeded, the last request is a request — and a refused
    // submit reported as that earlier success is a refusal a test can neither
    // see nor assert against.
    return finishRequests.length > before
      ? (finishRequests.at(-1) ?? null)
      : null;
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
      const applied = host.receiveAuthoritativeSections(
        codebookSections(patch),
      );
      act(() => {
        session.receiveAuthoritativeUpdate({
          protocolSections: sectionsKeepingSavedStage(
            applied.protocolSections,
            session,
            stageSectionId,
          ),
          manifestRevision: applied.manifestRevision,
        });
      });
      // The session may refuse an arrival, and refusing is silent by design.
      // The only way it can refuse this one is if a fabricated revision has
      // already taken the session past the host, so say that rather than leave
      // a test asserting against a codebook change that never landed.
      if (
        session.getSnapshot().manifestRevision.hash !==
        applied.manifestRevision.hash
      ) {
        throw new Error(
          'The session did not take the seeded codebook change. `receiveConflictingCodebookUpdate` has put this session ahead of the host, so nothing the host issues from here on is newer than what the session holds.',
        );
      }
    },
    receiveConflictingCodebookUpdate: (patch) => {
      // Past whichever of the two is further ahead, so the session takes it
      // however many revisions the host has issued, and unknown to the host,
      // which is the whole point.
      const sessionSequence = session.getSnapshot().manifestRevision.sequence;
      const hostSequence = host.getSnapshot().manifestRevision.sequence;
      const fabricated =
        (sessionSequence > hostSequence ? sessionSequence : hostSequence) + 1n;
      fabrications += 1n;
      act(() => {
        session.receiveAuthoritativeUpdate({
          protocolSections: patchedCodebook(
            session.getSnapshot().protocolSections,
            patch,
          ),
          manifestRevision: {
            sequence: fabricated,
            hash: `fabricated-revision-${fabrications}`,
          },
        });
      });
    },
    hostCodebook: () =>
      protocolContextFromSections(host.getSnapshot().protocolSections).codebook,
    pendingCommands: () => session.getSnapshot().pendingCommands,
    liveCommands: () => [...liveCommands],
    ownedKeys: () => readOwnedKeys(),
    roundTrip: async ({ unowned = [] } = {}) => {
      // Before the save, because it is a question about what is on screen and
      // the save's own failure would otherwise hide it.
      const owned = new Set(readOwnedKeys());
      const orphaned = Object.keys(seeded.fields).filter(
        (key) => !owned.has(key) && !unowned.includes(key),
      );
      if (orphaned.length > 0) {
        throw new Error(
          `Nothing mounted here edits "${seeded.id}" keys: ${orphaned.join(', ')}. They round-trip untouched, so a researcher cannot see or change them. Add the section that owns each one, or name it in \`unowned\` to say the editor does not own it yet.`,
        );
      }
      const request = await submit();
      if (request === null) {
        throw new Error(
          `The stage did not save, so nothing round-tripped. The editor is showing: ${visibleProblems(view.baseElement)}`,
        );
      }
      // `id` and `type` are the session's, never the editor's: `seeded.fields`
      // is the document without them, and `stageDocument` puts them back.
      const { id: _id, type: _type, ...saved } = request.stageDocument;
      const { dropped, added, changed } = stageDocumentDiff(
        seeded.fields,
        saved,
      );
      if (dropped.length > 0 || added.length > 0 || changed.length > 0) {
        throw new Error(
          `Saving "${seeded.id}" unchanged did not return the same stage.${
            dropped.length > 0 ? ` Dropped: ${dropped.join(', ')}.` : ''
          }${added.length > 0 ? ` Added: ${added.join(', ')}.` : ''}${
            changed.length > 0 ? ` Changed: ${changed.join(', ')}.` : ''
          }`,
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
            : {
                mode: 'editable',
                leaseOwner: FIXTURE_SESSION_OWNER,
                leaseEpoch: 2n,
              },
        );
      });
    },
  };
}

type HarnessUser = ReturnType<typeof userEvent.setup>;

// Read from the attribute rather than from `isContentEditable`, which jsdom
// leaves undefined.
const isContentEditable = (element: Element): boolean => {
  const editable = element.getAttribute('contenteditable');
  return editable === '' || editable === 'true';
};

/**
 * Whether a test has already selected something inside `element`.
 *
 * A RANGE, not a caret. Both are measured, and they are not the same case: a
 * click over a range collapses it to the END of the text, which is why a test
 * that selected one has to be typed into without a click of the harness's own;
 * a click anywhere else puts a collapsed caret at the START of the text,
 * whatever was there before. So a range is the only selection a test can
 * express that survives being typed into, and a caret is not a position this
 * harness can honour at all — see `withSafeTypingIntoRichText`.
 *
 * ProseMirror's own select-all puts both ends on the editable element itself
 * rather than in the text, so the ends are tested with `contains`, which
 * counts the element as containing itself.
 */
const hasSelectedRangeInside = (element: Element): boolean => {
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (
    selection == null ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    selection.anchorNode === null ||
    selection.focusNode === null
  ) {
    return false;
  }
  return (
    element.contains(selection.anchorNode) &&
    element.contains(selection.focusNode)
  );
};

/**
 * A keyboard whose `type` is safe to point at a rich text field.
 *
 * The rule: type into a rich text field from a click of its own, UNLESS the
 * test has already selected something in that field — then type as user-event
 * does, so the selection reaches the keystrokes.
 *
 * Both halves are one defect, which is that ProseMirror only learns of a
 * selection on its next turn of the event loop. Every top-level user-event
 * call is wrapped in `act`, so a call of its own is that turn, and the click
 * `type` makes inside itself is not.
 *
 * Without the separate click, `clear` then `type` on a `singleLine` field
 * saved "ho else?" for "Who else?": one keystroke short, from the top. jsdom
 * lays nothing out, so user-event cannot place a caret from coordinates; it
 * walks the element for text instead, finds none in a field that was just
 * emptied, and settles the caret at the END OF THE ELEMENT — outside the
 * paragraph rather than inside it. ProseMirror puts a stray selection like
 * that back, but `type` never gives it the turn, and the first character is
 * written into the DOM as a bare text node between blocks that a one-paragraph
 * document has nowhere to hold.
 *
 * With the separate click made unconditionally, a test that selects the answer
 * before typing over it appended instead: click, `{Control>}a{/Control}`,
 * `type` saved "OtherElse" for "Else". The extra click collapses the range to
 * the end of the text AND gives ProseMirror the turn in which to believe it,
 * so the keystrokes insert rather than replace. `type`'s own click collapses
 * the DOM selection too, but ProseMirror never sees it before the keystrokes
 * and replaces the selection it still holds — which is what a researcher
 * typing over selected text gets.
 *
 * What the click does NOT do is leave a caret where a test put one. Measured:
 * a click into a field holding text puts a collapsed caret at offset 0 of the
 * first text node — from a caret at 0, at 4, at the end, and from no selection
 * at all — so every `type` into a populated rich text field inserts at the
 * START of the answer. `skipClick` is no way round it either: without a turn of
 * the event loop ProseMirror never learns of the test's selection and puts its
 * own back, so nothing is typed anywhere. A test that wants a position has to
 * select a RANGE, which means in practice selecting the answer and typing it
 * out whole.
 *
 * Only `type` is wrapped, because only `type` clicks. `clear` selects and
 * deletes, and `paste` and `keyboard` write at the selection they are given —
 * and each is a top-level call, so ProseMirror gets its turn between them
 * anyway. Measured: `clear` then `paste`, and a select-all then `paste`, both
 * save the whole text.
 *
 * Nothing about the CONTROL is at fault either way — a researcher cannot put a
 * caret between blocks, and a browser's own click never does — so this is the
 * harness's to get right rather than the editor's.
 */
function withSafeTypingIntoRichText(keyboard: HarnessUser): HarnessUser {
  return {
    ...keyboard,
    type: async (element, text, options) => {
      if (
        options?.skipClick === true ||
        !isContentEditable(element) ||
        hasSelectedRangeInside(element)
      ) {
        return keyboard.type(element, text, options);
      }
      await keyboard.click(element);
      return keyboard.type(element, text, { ...options, skipClick: true });
    },
  };
}

function HarnessEditor<T extends StageType>({
  session,
  submitLabel,
  actions,
  editor: Editor,
  sections,
  registry,
}: Readonly<{
  session: ProtocolBuilderSessionStore;
  submitLabel: string;
  actions?: StageEditorActions;
  editor?: StageEditorComponent<T>;
  sections?: ReactNode;
  registry?: Partial<StageEditorRegistry>;
}>) {
  const controller = useStageEditorController(session, STAGE_FORM_ID);

  if (Editor !== undefined) {
    // The stage the session opened, as the editor's own stage type. They are
    // the same interface by construction — `T` comes from this very call — but
    // the session holds the type as a runtime string, and only the call site
    // knows which literal it is.
    const stageType = controller.snapshot.editedSection.identity.type as T;
    return (
      <Editor
        controller={controller}
        stageType={stageType}
        {...(actions === undefined ? {} : { actions })}
      />
    );
  }

  if (sections === undefined) {
    return (
      <StageEditor
        controller={controller}
        {...(registry === undefined ? {} : { registry })}
        {...(actions === undefined ? {} : { actions })}
      />
    );
  }

  return (
    <StageEditorShell
      controller={controller}
      actions={
        actions ??
        (({ formId }) => (
          <SubmitButton form={formId}>{submitLabel}</SubmitButton>
        ))
      }
    >
      {sections}
    </StageEditorShell>
  );
}

function seedFrom<T extends StageType>(
  options: RenderStageEditorOptions<T>,
): SeededStage {
  if (options.create !== undefined) {
    const { type, position, fields } = options.create;
    return {
      id: 'stage-under-test',
      type,
      // What a host opens a create session with: the interface's own authored
      // defaults, not a blank document and not a schema default.
      fields: { ...getInterfaceTemplate(type), ...fields },
      creation: { position },
    };
  }
  if (options.stage !== undefined) {
    const { id = 'stage-under-test', type, fields } = options.stage;
    return { id, type, fields };
  }
  if (options.stageId === undefined) {
    throw new Error(
      'renderStageEditor needs a stage: pass `stageId` to open one from the all-interfaces protocol, `stage` to build one, or `create` to open a new one.',
    );
  }
  return loadFixtureStage(options.stageId);
}

/**
 * The host's sections, with the edited stage left as the SESSION holds it.
 *
 * The harness's `onFinish` records the save instead of applying it — a test
 * asks what left the session, and a host that also committed it would answer
 * every other test's questions about the authoritative protocol differently.
 * So the host is deliberately a save behind on this one section, and handing
 * its copy back would undo the save inside the session: the editor would go on
 * describing the stage as it was before the researcher saved it.
 *
 * A codebook arrival says nothing about the stage anyway, which is what makes
 * keeping the session's own copy the honest answer rather than a patch over
 * the harness's shortcut. A stage being CREATED has no section in either place
 * yet, and is left exactly as the host answered.
 */
function sectionsKeepingSavedStage(
  hostSections: Readonly<Record<string, SectionDoc>>,
  session: ProtocolBuilderSessionStore,
  stageSectionId: ProtocolSectionId,
): Readonly<Record<string, SectionDoc>> {
  const saved = session.getSnapshot().protocolSections[stageSectionId];
  return saved === undefined
    ? hostSections
    : { ...hostSections, [stageSectionId]: saved };
}

/** A codebook patch as the sections it changes, `null` for the ones it removes. */
function codebookSections(
  patch: CodebookPatch,
): Record<string, SectionDoc | null> {
  const changed: Record<string, SectionDoc | null> = {};
  for (const [typeId, definition] of Object.entries(patch.node ?? {})) {
    changed[sectionId({ kind: 'codebookNode', typeId })] = definition;
  }
  for (const [typeId, definition] of Object.entries(patch.edge ?? {})) {
    changed[sectionId({ kind: 'codebookEdge', typeId })] = definition;
  }
  if (patch.ego !== undefined) {
    changed[sectionId({ kind: 'codebookEgo' })] = patch.ego;
  }
  return changed;
}

/** The sections a patch would leave behind, applied to a copy of `sections`. */
function patchedCodebook(
  sections: Readonly<Record<string, SectionDoc>>,
  patch: CodebookPatch,
): Record<string, SectionDoc> {
  const next: Record<string, SectionDoc> = { ...sections };
  for (const [id, definition] of Object.entries(codebookSections(patch))) {
    if (definition === null) delete next[id];
    else next[id] = definition;
  }
  return next;
}

/** What a round trip did to the stage, one path per difference. */
type StageDocumentDiff = Readonly<{
  /** In the seeded stage, gone from the saved one. */
  dropped: string[];
  /** In the saved stage, and in nothing the researcher authored. */
  added: string[];
  /** Present in both, holding something else. */
  changed: string[];
}>;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every way the saved stage differs from the seeded one, by path.
 *
 * Both directions and all the way down, because a stage document is a tree and
 * every one of its levels is authored content. A comparison that only walked
 * the seeded stage's top-level keys could not see a key the editor INVENTED —
 * a default stamped onto a protocol nobody asked to change — and a comparison
 * that stopped at the top could say no more than "`mapOptions` changed" about
 * a control that quietly dropped one setting out of eight.
 *
 * `isEqual` prunes: an identical subtree is not walked at all, so the paths
 * reported are exactly the differences and nothing else.
 */
function stageDocumentDiff(
  seeded: Readonly<Record<string, unknown>>,
  saved: Readonly<Record<string, unknown>>,
): StageDocumentDiff {
  const diff: StageDocumentDiff = { dropped: [], added: [], changed: [] };
  collectDifferences('', seeded, saved, diff);
  return diff;
}

function collectDifferences(
  path: string,
  seeded: unknown,
  saved: unknown,
  into: StageDocumentDiff,
): void {
  if (isEqual(seeded, saved)) return;

  if (isPlainRecord(seeded) && isPlainRecord(saved)) {
    for (const key of new Set([
      ...Object.keys(seeded),
      ...Object.keys(saved),
    ])) {
      const here = path === '' ? key : `${path}.${key}`;
      if (!Object.hasOwn(saved, key)) into.dropped.push(here);
      else if (!Object.hasOwn(seeded, key)) into.added.push(here);
      else collectDifferences(here, seeded[key], saved[key], into);
    }
    return;
  }

  if (Array.isArray(seeded) && Array.isArray(saved)) {
    const length = Math.max(seeded.length, saved.length);
    for (let index = 0; index < length; index += 1) {
      const here = `${path}[${index}]`;
      if (index >= saved.length) into.dropped.push(here);
      else if (index >= seeded.length) into.added.push(here);
      else collectDifferences(here, seeded[index], saved[index], into);
    }
    return;
  }

  // A leaf, or a value that changed shape — an object where a list was. Either
  // way the path itself is what a reader needs, not what is inside it.
  into.changed.push(path);
}

/**
 * The top-level stage keys the mounted sections have a field registered for.
 *
 * Scoped to the stage's own `<form>`. A row dialog mounts a form store of its
 * own in a portal outside it, and its fields are named after the row's
 * properties — `text`, `content` — which are not stage keys at all.
 */
function readOwnedKeys(): string[] {
  const form = document.getElementById(STAGE_FORM_ID);
  if (form === null) return [];
  const keys = new Set<string>();
  for (const field of form.querySelectorAll('[data-field-path]')) {
    const registeredName = field.getAttribute('data-field-path');
    if (registeredName === null || registeredName === '') continue;
    // Parsed rather than split on a dot: a protocol-authored key may contain
    // one, and `["prompt text"]` is a single name with a space in it.
    let root: string | number | undefined;
    try {
      [root] = resolveFieldPath([], registeredName, 'path');
    } catch {
      continue;
    }
    if (root !== undefined) keys.add(String(root));
  }
  return [...keys].toSorted();
}

function readOutline(): { title: string; state: string }[] {
  // By role alone, not by the landmark's own name: the harness mounts exactly
  // one navigation, and the name is copy — read under a locale that translates
  // it, a name-matched query would find nothing and report an editor with no
  // sections at all, which is a passing assertion about the wrong thing.
  const [nav] = screen.queryAllByRole('navigation');
  if (nav === undefined) return [];
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
