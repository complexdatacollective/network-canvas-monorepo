import {
  act,
  render,
  type RenderResult,
  waitFor,
  within,
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
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { saveStageMessages } from '../editors/saveStageAction.tsx';
import StageEditorShell from '../form/StageEditorShell.tsx';
import { getInterfaceTemplate } from '../interfaces/templates.ts';
import { protocolBuilderCatalogs } from '../locales/catalogs.ts';
import { protocolContextFromSections } from '../protocol-context.ts';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../resources/client.tsx';
import type {
  StageEditorActions,
  StageEditorComponent,
  StageEditorRegistry,
} from '../stage-editor-contract.ts';
import type { StageCreation } from '../stageDocument.ts';
import {
  StageEditSession,
  useStageEdit,
  type StageEditTarget,
} from '../stageEdit.tsx';
import StageEditor from '../StageEditor.tsx';
import {
  createInMemoryHost,
  type InMemoryHost,
} from './host/createInMemoryHost.ts';
import type { HostPrincipal } from './host/protocolStore.ts';
import {
  fixtureAssetContentFor,
  fixtureAssetManifest,
  fixtureProtocolSections,
  type FixtureStageId,
  loadFixtureStage,
} from './protocolFixture.ts';
import { HARNESS_PRINCIPAL, SeedProtocolCache } from './seedProtocolCache.tsx';

/**
 * A catalog entry and a `defaultMessage` are both typed as the string OR the
 * pre-parsed ICU form, and only the string one can name a control.
 */
const literal = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

/**
 * What the harness's own submit control says, in the reader's language.
 *
 * The `sections` path mounts a stand-in for the shared `saveStageAction`, so
 * it says the same words that control says — read out of the same catalog the
 * provider above it was given, and falling back to the descriptor's own
 * English when there is no provider at all. A literal here would be the one
 * English string on an otherwise Spanish surface, and the locale sweeps would
 * report the harness's defect against whichever section was open.
 */
const defaultSubmitLabel = (locale: string | undefined): string => {
  const { id, defaultMessage } = saveStageMessages.saveStage;
  const label =
    literal(
      locale === undefined || id === undefined
        ? undefined
        : protocolBuilderCatalogs[locale]?.[id],
    ) ?? literal(defaultMessage);
  // Thrown rather than fallen back from: an empty name would send every
  // `submit()` in the suite looking for a button called nothing, and every
  // one of them would fail somewhere other than here.
  if (label === undefined) {
    throw new TypeError(
      'The save-stage message is not a literal string, so the harness cannot name its own submit control.',
    );
  }
  return label;
};

/**
 * A DOM id for the stage form of one mounted harness.
 *
 * One id per harness rather than one for the package, because a test may mount
 * two — comparing two interfaces, or an editor against the sections it is
 * built from — and the id is not decoration. It is the whole contract for a
 * submit control the host renders OUTSIDE the form (`<button form={formId}>`,
 * which is where the shell puts the action slot), so two forms answering to
 * `stage-form` left the second harness's save button submitting the FIRST
 * harness's form. Duplicated ids are also why `document.getElementById` could
 * be read as "this harness's form" for as long as only one was ever mounted.
 *
 * The counter is not reset between tests, and nothing may depend on the
 * number: a test that needs the id reads `formId` off the harness.
 */
let harnessesMounted = 0;
const nextStageFormId = (): string => {
  harnessesMounted += 1;
  return `stage-form-${harnessesMounted}`;
};

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

/** The stage a harness opens, split the way a section document holds it. */
export type SeededStage = Readonly<{
  id: string;
  type: StageType;
  /** Everything but `id` and `type`, which the section owns. */
  fields: SectionDoc;
  /** Set only for a stage the protocol does not hold yet. */
  creation?: StageCreation;
}>;

/** A save the protocol took, and the stage document it now holds. */
export type SavedStage = Readonly<{
  sectionId: ProtocolSectionId;
  /** The stage as the protocol holds it, identity included. */
  stageDocument: SectionDoc;
}>;

export type StageEditorHarness = RenderResult &
  Readonly<{
    /**
     * The protocol, served from memory over the package's own host contract.
     *
     * `host.client` is what the editor is mounted over, `host.store` is what
     * the protocol actually holds, and `host.asCollaborator` is a second
     * connection — which is a second lock owner.
     */
    host: InMemoryHost;
    user: ReturnType<typeof userEvent.setup>;
    /**
     * The DOM id of THIS harness's stage form, which is what a host's own
     * action chrome is given as `formId`.
     */
    formId: string;
    /** The stage the editor opened on, exactly as it was seeded. */
    seeded: SeededStage;
    /**
     * Saves the stage and answers with what the protocol now holds, or `null`
     * when the editor refused to save.
     */
    submit(): Promise<SavedStage | null>;
    /**
     * Closes the editor without saving: the lock goes back and anything staged
     * in the edit is discarded.
     */
    cancel(): Promise<void>;
    /**
     * Waits for the host to answer the acquire, which is when the editor
     * learns whether this researcher may write to the stage.
     *
     * Until then the stage is on screen but not theirs: its controls are
     * disabled, and the ones a stage offers only to whoever holds it are not
     * rendered at all. `user` waits for this before every action it takes, so
     * a test needs it only where it reaches past the researcher's own actions
     * — driving a list's commands directly, or reading a control before
     * touching one.
     */
    opened(): Promise<void>;
    /**
     * Applies a codebook change as if another editor had made it before this
     * one opened.
     *
     * It reaches the protocol itself, so the revision travels the same channel
     * every other change does and every subscribed component sees it.
     */
    receiveCodebookUpdate(patch: CodebookPatch): void;
    /** Every section as the protocol holds it. */
    protocolSections(): Readonly<Record<string, SectionDoc>>;
    /**
     * The codebook as the PROTOCOL holds it, read the way an editor reads one:
     * the only way to prove that something an editor did reached the codebook,
     * or that nothing did.
     */
    hostCodebook(): Readonly<Codebook>;
    /**
     * The top-level stage keys the mounted sections have a field for.
     *
     * Read from the fields themselves — `data-field-path` is the canonical key
     * the form store files a field under — and scoped to the stage form, so a
     * row dialog's own fields (which belong to a form of their own, in a
     * portal) are not mistaken for the stage's.
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
     * comparison runs in both directions and all the way down, and each
     * difference is reported by its own path.
     *
     * A key NO section renders is a quieter failure: it survives the round trip
     * untouched, by design — an interface with no `skipLogic` section must not
     * delete skip logic someone authored — so a comparison can never see it.
     * The editor is simply missing a section, and a researcher who opens the
     * stage cannot see or change something their protocol holds. So an
     * unrendered key has to be declared, one at a time, in `unowned`.
     */
    roundTrip(
      options?: Readonly<{
        /**
         * TOP-LEVEL keys the mounted sections deliberately do not own. Every
         * other key of the seeded stage must be owned by a mounted section.
         */
        unowned?: readonly string[];
      }>,
    ): Promise<SavedStage>;
    /** The section outline, in the order it is rendered. */
    outline(): { title: string; state: string }[];
    /**
     * Hands the stage's lock to somebody else while this editor still believes
     * it holds it.
     *
     * The one thing an editor cannot see for itself: nothing tells it the lock
     * has gone, so it goes on editing and finds out when the host refuses its
     * submit. That is the whole of what the model says happens, and this is how
     * a test reaches it.
     */
    takeOverLock(): void;
  }>;

/**
 * How the harness mounts what is under test: one of three ways, and they are
 * alternatives rather than settings that combine.
 *
 * `editor` mounts a NAMED editor, which brings its own shell. `sections` puts
 * sections in the shared shell, which is how a section is tested without an
 * editor to put it in. `registry` — and giving none of the three — mounts the
 * package's own dispatcher, which is how a registry is tested. What is on
 * screen is a different thing in each case, so a call means exactly one.
 *
 * Written as a union so the compiler says that. They were three independent
 * optionals, and `HarnessEditor` simply preferred `editor`, then `sections`: a
 * call giving two mounted one and dropped the other in silence, so a test
 * could name the editor it meant to exercise and be running the dispatcher's
 * instead — passing, and about something else.
 *
 * `assertOneMountingMode` refuses the same combination at runtime, because the
 * compiler only sees the calls it can type: options built up as a wider object
 * and options a family's own helper assembles reach here as a value, and the
 * silent preference is not a thing to leave underneath them.
 */
type StageEditorMounting<T extends StageType> =
  | Readonly<{
      /**
       * The named editor under test, which brings its own shell.
       *
       * Typed for the stage this call opens rather than for every stage type,
       * so a narrowly typed family editor — `StageEditorComponent<'Information'>`
       * — is accepted directly. A component's props are contravariant, so the
       * wide slot this used to be refused exactly the editors the harness
       * exists to mount, and families had to go through `registry` to get
       * around it.
       *
       * `stage` and `create` name the interface in the same call, so pairing
       * one of them with an editor written for a different interface does not
       * compile.
       */
      editor: StageEditorComponent<T>;
      sections?: never;
      registry?: never;
    }>
  | Readonly<{
      editor?: never;
      /** The sections under test, which the harness puts in the shared shell. */
      sections: ReactNode;
      registry?: never;
    }>
  | Readonly<{
      editor?: never;
      sections?: never;
      /**
       * The editors the package's dispatcher chooses from, merged over the
       * ones it composes itself — see `StageEditor`. Left out along with the
       * other two, the dispatcher is mounted over the package's registry
       * alone.
       */
      registry?: Partial<StageEditorRegistry>;
    }>;

/**
 * Which stage the harness opens: one of three ways, and they are alternatives
 * rather than settings that combine.
 *
 * `stageId` opens a stage the shared all-interfaces protocol already holds.
 * `stage` builds one from a document the call writes. `create` opens a stage
 * that does not exist yet, the way a host opens a new one. Each answers "which
 * stage is under test?" with a different stage, so a call means exactly one.
 *
 * Written as a union so the compiler says that. They were three independent
 * optionals, and `seedFrom` simply preferred `create`, then `stage`, then
 * `stageId`: a call giving two opened one of them and dropped the other in
 * silence — so a test could name the fixture stage it meant to exercise and be
 * running against a document built beside it.
 *
 * `assertOneStageSource` refuses the same combination at runtime, for the same
 * reason `assertOneMountingMode` does: the compiler only sees the calls it can
 * type.
 */
type StageEditorSeeding<T extends StageType> =
  | Readonly<{
      /**
       * Open this stage of the shared all-interfaces protocol.
       *
       * Narrowed to the stages that ARE `T` as soon as the call has named an
       * interface — which, for this mounting mode, means as soon as it names
       * the editor under test. `T` used to come from the editor alone, and the
       * stage type the harness hands that editor is a runtime string the
       * call's own type parameter relabelled: an `Information` editor over
       * `ego-form-1` compiled, mounted, and was told it was editing an
       * EgoForm. See `FixtureStageId`.
       *
       * A call that has NOT named an interface — sections under test, the
       * dispatcher under test, a family helper passing an id it computed —
       * leaves `T` at the whole union and may pass any string; those are the
       * calls `assertDeclaredStageType` covers at open time.
       */
      stageId?: StageType extends T ? string : FixtureStageId<T>;
      stage?: never;
      create?: never;
    }>
  | Readonly<{
      stageId?: never;
      /** Or open a stage of this type holding these fields. */
      stage?: Readonly<{ id?: string; type: T; fields: SectionDoc }>;
      create?: never;
    }>
  | Readonly<{
      stageId?: never;
      stage?: never;
      /**
       * Or CREATE a stage of this type, the way a host opens a new one: it
       * starts from the interface's own template, it is not in the interview
       * yet, and `position` is where the host will insert it, counting from
       * zero.
       *
       * The edit is opened with that creation, so everything a section
       * derives from it — the proposed name, the destinations a skip may
       * continue at — is exercised here exactly as it will be in the host.
       */
      create?: Readonly<{
        type: T;
        position: number;
        /** Fields on top of the interface's template. */
        fields?: SectionDoc;
      }>;
    }>;

export type RenderStageEditorOptions<T extends StageType = StageType> =
  Readonly<{
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
     * The text this host serves for an asset `source`, for a file the protocol
     * does not ship. A control that reads what is INSIDE a file has states
     * only a file of that shape reaches.
     */
    assetBytes?: Readonly<Record<string, string>>;
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
    /**
     * Accessible name of the control that saves the stage.
     *
     * Left out, it is what the shared `saveStageAction` says in the language
     * this call opened — see `defaultSubmitLabel`. Give it only for a host's
     * own action chrome, which names its own control.
     */
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
     * change that needs one is refused naming them rather than applied.
     */
    heldSections?: readonly Readonly<{
      sectionId: ProtocolSectionId;
      displayName: string;
    }>[];
  }> &
    StageEditorMounting<T> &
    StageEditorSeeding<T>;

/** The three ways to mount, in the order a refusal names them. */
const MOUNTING_OPTIONS = ['editor', 'sections', 'registry'] as const;

/** The three ways to say which stage, in the order a refusal names them. */
const STAGE_OPTIONS = ['stageId', 'stage', 'create'] as const;

/**
 * Refuses a call that gave two alternatives where one was meant.
 *
 * Named rather than resolved: there is no answer to which of them a test meant,
 * and the harness preferring one is how a test came to be about something
 * other than what it names. Both options are in the message, because the call
 * that has to change is the one that gave two.
 *
 * One function for both sets, because the mistake and its remedy are the same
 * in both: the only thing that differs is which options are alternatives and
 * what each of them does.
 */
function assertOneOf(
  options: Readonly<Record<string, unknown>>,
  alternatives: readonly string[],
  explanation: string,
): void {
  const given = alternatives.filter((option) => options[option] !== undefined);
  if (given.length < 2) return;
  throw new Error(
    `renderStageEditor was given both \`${given[0]}\` and \`${given[1]}\`, which are alternative ${explanation}. Pass exactly one.`,
  );
}

const assertOneMountingMode = (
  options: Readonly<Record<string, unknown>>,
): void => {
  assertOneOf(
    options,
    MOUNTING_OPTIONS,
    "ways to mount what is under test: `editor` mounts a named editor, `sections` puts sections in the shared shell, and `registry` (or none of the three) mounts the package's dispatcher",
  );
};

const assertOneStageSource = (
  options: Readonly<Record<string, unknown>>,
): void => {
  assertOneOf(
    options,
    STAGE_OPTIONS,
    'ways to say which stage the editor opens: `stageId` opens one the shared all-interfaces protocol holds, `stage` builds one from a document, and `create` opens a stage that does not exist yet',
  );
};

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

/** The second connection every collaborator write is made from. */
const COLLABORATOR: HostPrincipal = {
  sessionId: 'collaborator-tab',
  userId: 'collaborator',
  displayName: 'Robin',
};

/**
 * Mounts a stage editor over the protocol, served from memory by the package's
 * own host contract.
 *
 * Nothing below the editor is stubbed: the host refuses a submit from a caller
 * that does not hold the lock, checks the shape of every section it is given,
 * and publishes each revision on the channel every subscribed component reads.
 * So a test that saves a stage has proved the protocol schema accepts it, and
 * one that writes to the codebook has proved a second editor could not have
 * been holding it.
 */
export function renderStageEditor<T extends StageType = StageType>(
  options: RenderStageEditorOptions<T> = {},
): StageEditorHarness {
  assertOneMountingMode(options);
  assertOneStageSource(options);
  const seeded = seedFrom(options);
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const assetManifest: Record<string, unknown> = {
    ...fixtureAssetManifest(),
    ...options.assets,
  };

  const host = createInMemoryHost({
    sections: seededSections(seeded, assetManifest),
    assetContent: fixtureAssetContentFor(assetManifest, options.assetBytes),
    principal: HARNESS_PRINCIPAL,
  });
  const { protocolId, store } = host;

  // Locks taken before the editor opens, which is what a collaborator holding
  // a section IS: the acquire the editor is about to make comes back read-only
  // and names them.
  if (options.readOnly === true && seeded.creation === undefined) {
    store.acquire(stageSectionId, COLLABORATOR);
  }
  for (const [index, held] of (options.heldSections ?? []).entries()) {
    store.acquire(held.sectionId, {
      sessionId: `holder-tab-${index}`,
      userId: `holder-user-${index}`,
      displayName: held.displayName,
    });
  }

  const saved: SavedStage[] = [];
  const submitLabel = options.submitLabel ?? defaultSubmitLabel(options.locale);
  const formId = nextStageFormId();
  const target: StageEditTarget =
    seeded.creation === undefined
      ? { sectionId: stageSectionId }
      : {
          stageType: seeded.type,
          position: seeded.creation.position,
          fields: seeded.fields,
        };

  const view = render(
    <LocaleFrame
      {...(options.locale === undefined ? {} : { locale: options.locale })}
    >
      <DialogProvider>
        <ProtocolBuilder client={host.client} protocolId={protocolId}>
          <SeedProtocolCache store={store}>
            <HarnessEditor
              target={target}
              formId={formId}
              submitLabel={submitLabel}
              onSaved={(id) => {
                saved.push({
                  sectionId: id,
                  stageDocument: store.read(id).document,
                });
              }}
              {...(options.actions === undefined
                ? {}
                : { actions: options.actions })}
              {...(options.editor === undefined
                ? {}
                : { editor: options.editor })}
              {...(options.sections === undefined
                ? {}
                : { sections: options.sections })}
              {...(options.registry === undefined
                ? {}
                : { registry: options.registry })}
            />
          </SeedProtocolCache>
        </ProtocolBuilder>
      </DialogProvider>
    </LocaleFrame>,
  );

  // No wait between keystrokes. user-event's default schedules a real 0ms
  // timer per key, and a timer is a turn of the event loop rather than
  // nothing: a section editor's tests type whole questions and attribute
  // names, so the suite spends real seconds waiting on nothing.
  //
  // What it costs is worth saying plainly: with the turn gone, nothing that
  // waits for one runs BETWEEN two keystrokes. A passive effect, a microtask
  // chain or a timer that a real typist's fingers would have let through
  // arrives here only after the whole string is in.
  const keyboard = userEvent.setup({ delay: null });
  const user = afterTheStageHasOpened(withSafeTypingIntoRichText(keyboard));

  /**
   * THIS harness's stage form, or `null` when what is mounted has none.
   *
   * Found inside this harness's own container and by this harness's own id:
   * `document.getElementById` answered with whichever form the document held
   * first, so a second harness reported the first one's fields as its own.
   */
  const stageForm = (): HTMLFormElement | null =>
    [...view.container.querySelectorAll('form')].find(
      (form) => form.id === formId,
    ) ?? null;

  /**
   * The form a `submit()` is waiting on, or a refusal saying there is none.
   *
   * A call may legitimately mount something with no shared shell under it — a
   * stand-in editor that renders a paragraph — and `submit()` on one of those
   * has nothing to wait for. Said rather than waited out: without this the
   * wait below would never be satisfied and the test would die at the suite's
   * timeout, naming neither the harness nor the editor that has no form.
   */
  const submittingForm = (): HTMLFormElement => {
    const form = stageForm();
    if (form === null) {
      throw new Error(
        `renderStageEditor: submit() found no form "${formId}" under this harness. What is mounted here does not build on \`StageEditorShell\`, so there is no stage form to submit or to wait on.`,
      );
    }
    return form;
  };

  const submit = async (): Promise<SavedStage | null> => {
    const before = saved.length;
    const button = within(view.container).getByRole('button', {
      name: submitLabel,
    });
    await user.click(button);
    await waitFor(() => {
      if (saved.length > before) return;
      // A submit that did not save has settled and left its reason on screen:
      // the form's own errors, or a field marked invalid for `focusFirstError`
      // to reach. Asserting both is what stops a submit still in flight from
      // being read as a refusal. Settling is read from the FORM, not from the
      // control that was clicked, because a host may render a plain
      // `<button form={formId}>` that says nothing about itself.
      expect(submittingForm()).toHaveAttribute('aria-busy', 'false');
      expect(refusalOnScreen(view.container)).toBe(true);
    });
    return saved.length > before ? (saved.at(-1) ?? null) : null;
  };

  return {
    ...view,
    host,
    user,
    formId,
    seeded,
    submit,
    cancel: async () => {
      // Unmounting IS the cancel: the lock goes back and whatever the edit
      // staged is discarded, both from the effects the editor set up.
      await act(async () => {
        view.unmount();
      });
    },
    opened: async () => {
      // Everything the mount set in motion, settled: the acquire is a promise
      // the effect made, so a turn of the microtask queue inside `act` is what
      // its answer and the render that follows are waiting for.
      await act(async () => {});
    },
    receiveCodebookUpdate: (patch) => {
      act(() => {
        for (const [id, document] of Object.entries(codebookSections(patch))) {
          store.applyAsCollaborator(
            sectionId(parseSectionId(id)),
            document ?? undefined,
          );
        }
      });
    },
    protocolSections: () =>
      Object.fromEntries(
        store.sectionIds().map((id) => [id, store.read(id).document]),
      ),
    hostCodebook: () =>
      protocolContextFromSections(
        Object.fromEntries(
          store.sectionIds().map((id) => [id, store.read(id).document]),
        ),
      ).codebook,
    ownedKeys: () => readOwnedKeys(stageForm()),
    roundTrip: async ({ unowned = [] } = {}) => {
      // Before the save, because it is a question about what is on screen and
      // the save's own failure would otherwise hide it.
      const owned = new Set(readOwnedKeys(stageForm()));
      const orphaned = Object.keys(seeded.fields).filter(
        (key) => !owned.has(key) && !unowned.includes(key),
      );
      if (orphaned.length > 0) {
        throw new Error(
          `Nothing mounted here edits "${seeded.id}" keys: ${orphaned.join(', ')}. They round-trip untouched, so a researcher cannot see or change them. Add the section that owns each one, or name it in \`unowned\` to say the editor does not own it yet.`,
        );
      }
      const written = await submit();
      if (written === null) {
        throw new Error(
          `The stage did not save, so nothing round-tripped. The editor is showing: ${visibleProblems(view.container)}`,
        );
      }
      // `id` and `type` are the section's, never the editor's: `seeded.fields`
      // is the document without them.
      const { id: _id, type: _type, ...savedFields } = written.stageDocument;
      const { dropped, added, changed } = stageDocumentDiff(
        seeded.fields,
        savedFields,
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
      return written;
    },
    outline: () => readOutline(view.container),
    takeOverLock: () => {
      store.release(stageSectionId, HARNESS_PRINCIPAL);
      store.acquire(stageSectionId, COLLABORATOR);
    },
  };
}

type HarnessUser = ReturnType<typeof userEvent.setup>;

/**
 * The researcher's own actions, taken once the stage has finished opening.
 *
 * A stage is not editable until the host has answered its acquire: until then
 * nobody has said whether this researcher may write to it, so the form renders
 * with its controls disabled. A test's first keystroke is otherwise in the
 * same turn as the render — earlier than any researcher could act, and into a
 * form that is on screen but not yet theirs.
 *
 * Waited for here, in the one place every test's interaction goes through,
 * rather than by each test: what a test is about is what it does to an open
 * editor, and "await the acquire first" in three hundred tests would be the
 * harness's own timing written out three hundred times.
 */
function afterTheStageHasOpened(keyboard: HarnessUser): HarnessUser {
  return new Proxy(keyboard, {
    get: (target, property, receiver) => {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      const action = value as (...args: unknown[]) => unknown;
      return async (...args: unknown[]) => {
        // Everything the mount set in motion, settled: the acquire above all,
        // which is what takes the controls out of their disabled state.
        await act(async () => {});
        return action.apply(target, args);
      };
    },
  });
}

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
  target,
  formId,
  submitLabel,
  onSaved,
  actions,
  editor: Editor,
  sections,
  registry,
}: Readonly<{
  target: StageEditTarget;
  /** This harness's own form id. See `nextStageFormId`. */
  formId: string;
  submitLabel: string;
  onSaved: (sectionId: ProtocolSectionId) => void;
  actions?: StageEditorActions;
  editor?: StageEditorComponent<T>;
  sections?: ReactNode;
  registry?: Partial<StageEditorRegistry>;
}>) {
  if (sections === undefined && Editor === undefined) {
    return (
      <StageEditor
        target={target}
        formId={formId}
        onSaved={onSaved}
        {...(registry === undefined ? {} : { registry })}
        {...(actions === undefined ? {} : { actions })}
      />
    );
  }

  return (
    <ResourceClientProvider>
      <StageEditSession target={target} formId={formId} onSaved={onSaved}>
        {Editor === undefined ? (
          <StageEditorShell
            actions={
              // This harness's own id, which is what the shell hands the slot
              // anyway: read from the prop rather than out of the context so
              // the name means one thing in this component.
              actions ??
              (() => <SubmitButton form={formId}>{submitLabel}</SubmitButton>)
            }
          >
            {sections}
          </StageEditorShell>
        ) : (
          <NamedEditorUnderTest
            editor={Editor}
            {...(actions === undefined ? {} : { actions })}
          />
        )}
      </StageEditSession>
    </ResourceClientProvider>
  );
}

/**
 * The named editor under test, given the interface the stage actually is.
 *
 * They are the same interface by construction — `T` comes from the call that
 * named both — but the stage's type is a runtime string on its document, and
 * only the call site knows which literal it is.
 */
function NamedEditorUnderTest<T extends StageType>({
  editor: Editor,
  actions,
}: Readonly<{
  editor: StageEditorComponent<T>;
  actions?: StageEditorActions;
}>) {
  const { identity } = useStageEdit();
  if (identity === undefined) return null;
  return (
    <Editor
      stageType={identity.type as T}
      {...(actions === undefined ? {} : { actions })}
    />
  );
}

/**
 * The stage the editor is opened on, from whichever of the three the call
 * gave.
 *
 * The order below is not a preference: `assertOneStageSource` has already
 * refused a call that gave two, so at most one of these branches can be taken.
 * See `StageEditorSeeding`.
 */
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

/**
 * The protocol the harness serves, with the stage under test in it.
 *
 * A stage the fixture does not contain still has to be part of the protocol it
 * is validated inside, or every save fails on the stage order — unless it is
 * being CREATED, which is exactly the case where the protocol does not hold it
 * yet.
 */
function seededSections(
  seeded: SeededStage,
  assetManifest: Readonly<Record<string, unknown>>,
): Record<string, SectionDoc> {
  const base = fixtureProtocolSections();
  const sections: Record<string, SectionDoc> = { ...base };
  if (seeded.creation === undefined) {
    sections[sectionId({ kind: 'stage', stageId: seeded.id })] = {
      id: seeded.id,
      type: seeded.type,
      ...seeded.fields,
    };
    sections[sectionId({ kind: 'stageOrder' })] = {
      stages: stageOrderWith(base, seeded.id),
    };
  }
  sections[sectionId({ kind: 'assets' })] = assetManifest;
  return sections;
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
function readOwnedKeys(form: HTMLFormElement | null): string[] {
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

function readOutline(container: HTMLElement): {
  title: string;
  state: string;
}[] {
  // By role alone, not by the landmark's own name: THIS harness mounts exactly
  // one navigation, and the name is copy — read under a locale that translates
  // it, a name-matched query would find nothing and report an editor with no
  // sections at all, which is a passing assertion about the wrong thing.
  //
  // Scoped to this harness's own container rather than read off `screen`,
  // which is the whole document: a test mounting two harnesses got the first
  // one's outline from both of them.
  const [nav] = within(container).queryAllByRole('navigation');
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
