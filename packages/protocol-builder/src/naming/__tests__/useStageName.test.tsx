import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../../form/stageEditorContext.ts';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../../resources/client.tsx';
import { StageEditSession, type StageEditTarget } from '../../stageEdit.tsx';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import HostStageTitle from '../../testing/HostStageTitle.tsx';
import {
  HARNESS_PRINCIPAL,
  SeedProtocolCache,
} from '../../testing/seedProtocolCache.tsx';
import type { StageLabelPanel } from '../proposeStageLabel.ts';
import { type StageName, useStageName } from '../useStageName.ts';
import { useStageNameField } from '../useStageNameField.ts';

const EDITED_STAGE_ID = 'stage-edited';
const EDITED_SECTION = sectionId({ kind: 'stage', stageId: EDITED_STAGE_ID });

const personNode = (name: string): SectionDoc => ({
  name,
  label: { en: name },
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {
    diabetes: { name: 'Diabetes', label: { en: 'Diabetes' }, type: 'boolean' },
    asthma: { name: 'Asthma', label: { en: 'Asthma' }, type: 'boolean' },
  },
});

const informationStage = (id: string, label: string): SectionDoc => ({
  id,
  type: 'Information',
  label: { en: label },
  title: { en: label },
  items: [],
});

const ENGLISH = { defaultLocale: 'en', locales: ['en'] };
const ENGLISH_AND_SPANISH = { defaultLocale: 'en', locales: ['en', 'es'] };

type SectionMap = Record<string, SectionDoc>;

const protocolSections = (extra: SectionMap = {}): SectionMap => ({
  [sectionId({ kind: 'settings' })]: { localization: ENGLISH },
  [sectionId({ kind: 'stageOrder' })]: { stages: ['stage-other'] },
  [sectionId({ kind: 'stage', stageId: 'stage-other' })]: informationStage(
    'stage-other',
    'An existing stage',
  ),
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: personNode('Person'),
  [sectionId({ kind: 'codebookEdge', typeId: 'friendship' })]: {
    name: 'Friendship',
    label: { en: 'Friendship' },
    variables: {},
  },
  ...extra,
});

type EditorOptions = Readonly<{
  type?: StageType;
  fields?: SectionDoc;
  sections?: SectionMap;
  /**
   * Opens the stage as one the interview already contains, rather than one
   * being created. Only a stage being created is named automatically, and that
   * is the open edit's own answer — the hook is told nothing.
   */
  existing?: boolean;
  /**
   * Draws no name control at all, and hands the hook's own answer back
   * instead. What a host with a rename dialog and no stage title does.
   */
  headless?: boolean;
}>;

function Editor({
  sections,
  target,
  headless,
  onStore,
  onLiveDraft,
  onHost,
  onName,
}: {
  sections: SectionMap;
  target: StageEditTarget;
  headless: boolean;
  onStore: (storeApi: StageFormStoreApi) => void;
  onLiveDraft: (read: () => SectionDoc) => void;
  onHost: (host: ReturnType<typeof createInMemoryHost>) => void;
  onName: (name: StageName) => void;
}) {
  const [host] = useState(() => {
    const built = createInMemoryHost({
      sections,
      principal: HARNESS_PRINCIPAL,
    });
    onHost(built);
    return built;
  });

  return (
    <ProtocolBuilder adapter={host.adapter} protocolId={host.protocolId}>
      <SeedProtocolCache store={host.store}>
        <ResourceClientProvider>
          <StageEditSession target={target} formId="stage-form">
            <StageEditorShell>
              {headless ? <HeadlessName onName={onName} /> : <HostStageTitle />}
              <Probe onStore={onStore} onLiveDraft={onLiveDraft} />
            </StageEditorShell>
          </StageEditSession>
        </ResourceClientProvider>
      </SeedProtocolCache>
    </ProtocolBuilder>
  );
}

function Probe({
  onStore,
  onLiveDraft,
}: {
  onStore: (api: StageFormStoreApi) => void;
  onLiveDraft: (read: () => SectionDoc) => void;
}) {
  const { storeApi, liveDraft } = useStageEditorForm();
  onStore(storeApi);
  onLiveDraft(liveDraft);
  return null;
}

/**
 * The name with nothing DRAWN from it: no control, no label, no refusal.
 *
 * Two hooks, because they answer two different questions. `useStageName` is
 * the value and the writes, and may be called anywhere and as often as a host
 * likes. `useStageNameField` is the registration — the one thing that puts the
 * name among the paths a submit is entitled to write — and has exactly one
 * caller. A host with a rename dialog and no title needs both: without the
 * second, the rename is written into a form the save then ignores, and the
 * researcher watches it disappear on save.
 */
function HeadlessName({ onName }: { onName: (name: StageName) => void }) {
  onName(useStageName());
  useStageNameField();
  return null;
}

/**
 * A stage editor driven the way a host drives one: the package's own host
 * contract served from memory, the real shell, and the title a host draws from
 * the hook's own bindings. Nothing about the codebook, the asset manifest or
 * the stage order is mocked — every one of them is read from the protocol the
 * host serves.
 */
function renderEditor(options: EditorOptions = {}) {
  const headless = options.headless === true;
  const type = options.type ?? 'NameGenerator';
  const fields = options.fields ?? {};
  const existing = options.existing === true;
  const sections: SectionMap = {
    ...(options.sections ?? protocolSections()),
    ...(existing
      ? { [EDITED_SECTION]: { id: EDITED_STAGE_ID, type, ...fields } }
      : {}),
  };
  const target: StageEditTarget = existing
    ? { sectionId: EDITED_SECTION }
    : { stageType: type, position: 1, fields };

  let storeApi: StageFormStoreApi | null = null;
  let host: ReturnType<typeof createInMemoryHost> | null = null;
  let stageName: StageName | null = null;
  let readLiveDraft: (() => SectionDoc) | null = null;

  render(
    <DialogProvider>
      <Editor
        sections={sections}
        target={target}
        headless={headless}
        onStore={(api) => {
          storeApi = api;
        }}
        onLiveDraft={(read) => {
          readLiveDraft = read;
        }}
        onHost={(built) => {
          host = built;
        }}
        onName={(name) => {
          stageName = name;
        }}
      />
    </DialogProvider>,
  );

  const input = headless
    ? undefined
    : screen.getByRole('textbox', { name: 'Stage name' });

  return {
    /** The name control. Absent — and asked for by mistake — when headless. */
    get input(): HTMLElement {
      if (input === undefined) {
        throw new Error('This editor draws no name control.');
      }
      return input;
    },
    /** What the hook last answered. Read fresh, never held across an act. */
    name: () => stageName as StageName | null,
    /** The document a submit would write, as the form holds it right now. */
    liveDraft: () => (readLiveDraft as (() => SectionDoc) | null)?.(),
    setValue: (name: string, value: FieldValue) =>
      act(() => {
        storeApi?.getState().setFieldValue(name, value);
      }),
    /** A codebook change made somewhere other than this editor. */
    renameNodeType: (typeId: string, definition: SectionDoc) =>
      act(() => {
        host?.store.applyAsCollaborator(
          sectionId({ kind: 'codebookNode', typeId }),
          definition,
        );
      }),
  };
}

/** Long enough for a wrongly-armed proposal to have overwritten the field. */
const settle = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      }),
  );

describe('useStageName', () => {
  it('proposes a name from the stage type and refines it from the subject', async () => {
    const { input, setValue } = renderEditor();

    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    setValue('subject', { entity: 'node', type: 'person' });
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );
  });

  it('reads the subject from the committed draft when no field holds it', async () => {
    const { input } = renderEditor({
      type: 'Sociogram',
      fields: { subject: { entity: 'edge', type: 'friendship' } },
    });

    await waitFor(() => expect(input).toHaveValue('Friendship Sociogram'));
  });

  it('qualifies a name from prompts and codebook attribute names', async () => {
    const { input } = renderEditor({
      type: 'FamilyPedigree',
      fields: {
        subject: { entity: 'node', type: 'person' },
        nominationPrompts: [{ variable: 'diabetes' }],
      },
    });

    await waitFor(() =>
      expect(input).toHaveValue(
        'Person Family Pedigree with Diabetes Nomination',
      ),
    );
  });

  it('names a nomination attribute that only an edge type declares', async () => {
    const { input } = renderEditor({
      type: 'FamilyPedigree',
      sections: protocolSections({
        [sectionId({ kind: 'codebookEdge', typeId: 'friendship' })]: {
          name: 'Friendship',
          label: { en: 'Friendship' },
          variables: {
            closeness: {
              name: 'Closeness',
              label: { en: 'Closeness' },
              type: 'scalar',
            },
          },
        },
      }),
      fields: {
        subject: { entity: 'node', type: 'person' },
        // A nomination prompt names an attribute by key alone, so the lookup
        // cannot be scoped to the node codebook: an attribute only an edge
        // type declares would come back nameless and drop out of the proposal.
        nominationPrompts: [{ variable: 'closeness' }],
      },
    });

    await waitFor(() =>
      expect(input).toHaveValue(
        'Person Family Pedigree with Closeness Nomination',
      ),
    );
  });

  it('qualifies an Information stage from the asset manifest', async () => {
    const { input } = renderEditor({
      type: 'Information',
      fields: {
        items: [
          { id: 'item-1', type: 'asset', content: 'asset-video' },
          { id: 'item-2', type: 'asset', content: 'asset-image' },
          { id: 'item-3', type: 'text', content: { en: 'Some prose' } },
        ],
      },
      sections: protocolSections({
        [sectionId({ kind: 'assets' })]: {
          'asset-video': { name: 'A film', type: 'video', source: 'film.mp4' },
          'asset-image': {
            name: 'A photo',
            type: 'image',
            source: 'photo.png',
          },
        },
      }),
    });

    await waitFor(() =>
      expect(input).toHaveValue('Information with Image & Video'),
    );
  });

  it('qualifies a name generator from the panels beside its question', async () => {
    const { input } = renderEditor({
      fields: { panels: [{ dataSource: 'roster-asset' }] },
    });

    await waitFor(() =>
      expect(input).toHaveValue('Form Name Generator with Roster Panels'),
    );
  });

  it('re-proposes when the codebook changes underneath the editor', async () => {
    const { input, renameNodeType, setValue } = renderEditor();
    setValue('subject', { entity: 'node', type: 'person' });
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );

    renameNodeType('person', personNode('Participant'));

    await waitFor(() =>
      expect(input).toHaveValue('Participant Form Name Generator'),
    );
  });

  it('never overwrites a name the researcher typed', async () => {
    const { input, renameNodeType, setValue } = renderEditor();
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // One change, the way selecting all and typing arrives.
    fireEvent.change(input, { target: { value: 'My custom stage' } });
    await waitFor(() => expect(input).toHaveValue('My custom stage'));

    // Two different reasons the proposal would be recomputed: the draft
    // changing, and the codebook changing under the editor. Neither is licence
    // to replace what the researcher typed.
    setValue('subject', { entity: 'node', type: 'person' });
    renameNodeType('person', personNode('Participant'));

    await settle();
    expect(input).toHaveValue('My custom stage');
  });

  it('leaves a cleared name empty while typing, and re-proposes on blur', async () => {
    const { input } = renderEditor();
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // Clearing must not instantly refill and fight a rename mid-keystroke.
    fireEvent.change(input, { target: { value: '' } });
    await settle();
    expect(input).toHaveValue('');

    fireEvent.blur(input);
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));
  });

  it('proposes nothing for a stage that is not being created', async () => {
    const { input, setValue } = renderEditor({
      type: 'Sociogram',
      fields: { label: { en: 'Hand named' } },
      existing: true,
    });

    setValue('subject', { entity: 'node', type: 'person' });
    await settle();
    expect(input).toHaveValue('Hand named');
  });

  /**
   * A proposal is offered for every stage, named or not — only WRITING it
   * unasked is reserved for a stage being created. A host with a "suggest a
   * name" control takes the same proposal by hand, on a stage that already
   * exists.
   */
  it('names an existing stage when a host accepts the proposal', async () => {
    const { name, liveDraft } = renderEditor({
      type: 'Sociogram',
      fields: { subject: { entity: 'node', type: 'person' } },
      existing: true,
      headless: true,
    });

    await settle();
    expect(name()?.value).toBe('');
    // Offered even though nothing will write it unasked, which is the whole
    // of what a "suggest a name" control needs.
    expect(name()?.proposal).toBe('Person Sociogram');

    act(() => {
      name()?.acceptProposal();
    });

    await waitFor(() => expect(name()?.value).toBe('Person Sociogram'));
    expect(liveDraft()?.label).toEqual({ en: 'Person Sociogram' });
  });

  it('leaves an existing stage with an empty name empty', async () => {
    // A hand-authored or migrated stage with no name is still not a stage
    // being created, and filling it in would be this editor putting a name
    // into a protocol nobody asked it to name.
    const { input } = renderEditor({
      type: 'Sociogram',
      fields: {},
      existing: true,
    });

    await settle();
    expect(input).toHaveValue('');
    fireEvent.blur(input);
    await settle();
    expect(input).toHaveValue('');
  });

  /**
   * A host that DRAWS no name control still renames the stage, as long as it
   * has bound the field.
   *
   * `useStageNameField` is what registers it, and registration is what makes
   * the name one of the paths a submit is entitled to write — a rename written
   * at an unregistered path round-trips untouched, like every other key the
   * editor never rendered.
   */
  it('renames a stage from a host that draws no control', async () => {
    const { name, liveDraft } = renderEditor({
      type: 'Sociogram',
      fields: { label: { en: 'Hand named' } },
      existing: true,
      headless: true,
    });

    // Settled rather than merely rendered: until the host has answered the
    // acquire the editor may not write at all, and a rename made in that
    // window is refused like any other — which is the same answer a
    // structural write gets, and the reason it is worth trying again in a
    // moment.
    await settle();
    expect(name()?.value).toBe('Hand named');

    act(() => {
      name()?.setValue('Renamed from a menu');
    });

    expect(liveDraft()?.label).toEqual({ en: 'Renamed from a menu' });
    expect(name()?.value).toBe('Renamed from a menu');
  });
});

describe('a name written in more than one language', () => {
  const bilingual = (extra: SectionMap = {}) =>
    protocolSections({
      [sectionId({ kind: 'settings' })]: { localization: ENGLISH_AND_SPANISH },
      ...extra,
    });

  it('renames only the translation in the editing language', async () => {
    const user = userEvent.setup();
    const { input, liveDraft } = renderEditor({
      type: 'Sociogram',
      fields: { label: { en: 'Hand named', es: 'Nombrado a mano' } },
      existing: true,
      sections: bilingual(),
    });
    await settle();
    expect(input).toHaveValue('Hand named');
    expect(input.closest('[lang]')).toHaveAttribute('lang', 'en');

    await user.click(screen.getByRole('button', { name: /Editing language/ }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /^español/ }),
    );

    const spanish = screen.getByRole('textbox', { name: 'Stage name' });
    expect(spanish).toHaveValue('Nombrado a mano');
    expect(spanish.closest('[lang]')).toHaveAttribute('lang', 'es');

    fireEvent.change(spanish, { target: { value: 'Sociograma' } });
    expect(liveDraft()?.label).toEqual({ en: 'Hand named', es: 'Sociograma' });
  });

  it('writes a proposal as the default language and keeps the translations', async () => {
    const { name, liveDraft } = renderEditor({
      type: 'Sociogram',
      fields: {
        label: { es: 'Sociograma' },
        subject: { entity: 'node', type: 'person' },
      },
      existing: true,
      headless: true,
      sections: bilingual(),
    });
    await settle();
    expect(name()?.value).toBe('');

    act(() => {
      name()?.acceptProposal();
    });

    await waitFor(() =>
      expect(liveDraft()?.label).toEqual({
        es: 'Sociograma',
        en: 'Person Sociogram',
      }),
    );
  });

  it('dedupes a proposal against the default-language names only', async () => {
    const { input } = renderEditor({
      type: 'Information',
      sections: bilingual({
        [sectionId({ kind: 'stage', stageId: 'stage-other' })]: {
          ...informationStage('stage-other', 'About the study'),
          label: { en: 'About the study', es: 'Information' },
        },
      }),
    });

    await waitFor(() => expect(input).toHaveValue('Information'));
  });
});

/**
 * The same inputs Architect's own auto-namer was tested against, run through
 * the package hook end to end. The expected strings are Architect's, so this
 * fails if the move changed what any of the parts contribute to a name — not
 * only if one part in isolation changed.
 */
describe('useStageName parity with Architect', () => {
  const cases: readonly Readonly<{
    name: string;
    type: StageType;
    fields: SectionDoc;
    panels?: readonly StageLabelPanel[];
    expected: string;
  }>[] = [
    {
      name: 'a subjectless name generator',
      type: 'NameGenerator',
      fields: {},
      expected: 'Form Name Generator',
    },
    {
      name: 'a name generator with a node subject',
      type: 'NameGenerator',
      fields: { subject: { entity: 'node', type: 'person' } },
      expected: 'Person Form Name Generator',
    },
    {
      name: 'network panels',
      type: 'NameGenerator',
      fields: {},
      panels: [{ dataSource: 'existing' }],
      expected: 'Form Name Generator with Network Panels',
    },
    {
      name: 'mixed panels',
      type: 'NameGeneratorQuickAdd',
      fields: {},
      panels: [{ dataSource: 'existing' }, { dataSource: 'roster-asset' }],
      expected: 'Quick Add Name Generator with Panels',
    },
    {
      name: 'a single nomination',
      type: 'FamilyPedigree',
      fields: { nominationPrompts: [{ variable: 'diabetes' }] },
      expected: 'Family Pedigree with Diabetes Nomination',
    },
    {
      name: 'a stage type with no qualifier',
      type: 'Sociogram',
      fields: { subject: { entity: 'edge', type: 'friendship' } },
      expected: 'Friendship Sociogram',
    },
  ];

  it.each(cases)('derives the same name for $name', async (testCase) => {
    const { input } = renderEditor({
      type: testCase.type,
      fields: {
        ...testCase.fields,
        ...(testCase.panels === undefined ? {} : { panels: testCase.panels }),
      },
    });

    await waitFor(() => expect(input).toHaveValue(testCase.expected));
  });
});
