import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
import StageNameSection from '../../sections/stage-heading/StageNameSection.tsx';
import { StageEditSession, type StageEditTarget } from '../../stageEdit.tsx';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import {
  HARNESS_PRINCIPAL,
  SeedProtocolCache,
} from '../../testing/seedProtocolCache.tsx';
import type { AutoStageNamePanel } from '../useAutoStageName.ts';

const EDITED_STAGE_ID = 'stage-edited';
const EDITED_SECTION = sectionId({ kind: 'stage', stageId: EDITED_STAGE_ID });

type AutoNameProps = Readonly<{
  propose?: boolean;
  panels?: readonly AutoStageNamePanel[];
}>;

const personNode = (name: string): SectionDoc => ({
  name,
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {
    diabetes: { name: 'Diabetes', type: 'boolean' },
    asthma: { name: 'Asthma', type: 'boolean' },
  },
});

const informationStage = (id: string, label: string): SectionDoc => ({
  id,
  type: 'Information',
  label,
  title: label,
  items: [],
});

type SectionMap = Record<string, SectionDoc>;

const protocolSections = (extra: SectionMap = {}): SectionMap => ({
  [sectionId({ kind: 'stageOrder' })]: { stages: ['stage-other'] },
  [sectionId({ kind: 'stage', stageId: 'stage-other' })]: informationStage(
    'stage-other',
    'An existing stage',
  ),
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: personNode('Person'),
  [sectionId({ kind: 'codebookEdge', typeId: 'friendship' })]: {
    name: 'Friendship',
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
   * is what the open edit says — nothing is passed to the section.
   */
  existing?: boolean;
  /**
   * The material only the editor can supply, and the override for whether to
   * propose at all. Whether to propose is otherwise read from the open edit, so
   * this stays out unless the stage has panels.
   */
  autoName?: AutoNameProps;
}>;

function Editor({
  sections,
  target,
  autoName,
  onStore,
  onHost,
}: {
  sections: SectionMap;
  target: StageEditTarget;
  autoName: AutoNameProps | undefined;
  onStore: (storeApi: StageFormStoreApi) => void;
  onHost: (host: ReturnType<typeof createInMemoryHost>) => void;
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
    <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
      <SeedProtocolCache store={host.store}>
        <ResourceClientProvider>
          <StageEditSession target={target} formId="stage-form">
            <StageEditorShell>
              <StageNameSection
                position={{ index: 1, total: 2 }}
                {...(autoName === undefined ? {} : { autoName })}
              />
              <Probe onStore={onStore} />
            </StageEditorShell>
          </StageEditSession>
        </ResourceClientProvider>
      </SeedProtocolCache>
    </ProtocolBuilder>
  );
}

function Probe({ onStore }: { onStore: (api: StageFormStoreApi) => void }) {
  onStore(useStageEditorForm().storeApi);
  return null;
}

/**
 * A stage editor driven the way a host drives one: the package's own host
 * contract served from memory, the real shell, and the real name section.
 * Nothing about the codebook, the asset manifest or the stage order is mocked —
 * every one of them is read from the protocol the host serves.
 */
function renderEditor(options: EditorOptions = {}) {
  const type = options.type ?? 'NameGenerator';
  const fields = options.fields ?? { label: '' };
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

  render(
    <DialogProvider>
      <Editor
        sections={sections}
        target={target}
        autoName={options.autoName}
        onStore={(api) => {
          storeApi = api;
        }}
        onHost={(built) => {
          host = built;
        }}
      />
    </DialogProvider>,
  );

  const input = screen.getByRole('textbox', { name: 'Stage name' });

  return {
    input,
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

describe('useAutoStageName', () => {
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
      fields: { label: '', subject: { entity: 'edge', type: 'friendship' } },
    });

    await waitFor(() => expect(input).toHaveValue('Friendship Sociogram'));
  });

  it('qualifies a name from prompts and codebook attribute names', async () => {
    const { input } = renderEditor({
      type: 'FamilyPedigree',
      fields: {
        label: '',
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
          variables: { closeness: { name: 'Closeness', type: 'scalar' } },
        },
      }),
      fields: {
        label: '',
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
        label: '',
        items: [
          { id: 'item-1', type: 'asset', content: 'asset-video' },
          { id: 'item-2', type: 'asset', content: 'asset-image' },
          { id: 'item-3', type: 'text', content: 'Some prose' },
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

  it('qualifies a name generator from the panels its editor supplies', async () => {
    const { input } = renderEditor({
      autoName: { panels: [{ dataSource: 'roster-asset' }] },
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

  it('de-duplicates against the other stages, but not against itself', async () => {
    const { input } = renderEditor({
      type: 'Information',
      existing: true,
      // The stage being edited is in the protocol, holding the very name it is
      // about to be proposed again. Counting it would suffix the proposal
      // against the stage's own last accepted name.
      fields: { label: 'Information #2', title: 'Information #2', items: [] },
      autoName: { propose: true },
      sections: protocolSections({
        [sectionId({ kind: 'stageOrder' })]: {
          stages: ['stage-other', EDITED_STAGE_ID],
        },
        [sectionId({ kind: 'stage', stageId: 'stage-other' })]:
          informationStage('stage-other', 'Information'),
      }),
    });

    // The researcher clears the name and tabs away, which is what asks for the
    // proposal again.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue('Information #2'));
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
      fields: { label: 'Hand named' },
      existing: true,
    });

    setValue('subject', { entity: 'node', type: 'person' });
    await settle();
    expect(input).toHaveValue('Hand named');
  });

  /**
   * The open edit's answer is a default, not a rule. An editor with a reason to
   * disagree says so, and is obeyed in both directions.
   */
  it('proposes nothing for a stage being created when the editor says not to', async () => {
    const { input, setValue } = renderEditor({
      type: 'Sociogram',
      fields: { label: '' },
      autoName: { propose: false },
    });

    setValue('subject', { entity: 'node', type: 'person' });
    await settle();
    expect(input).toHaveValue('');
  });

  it('proposes for an existing stage when the editor asks it to', async () => {
    const { input } = renderEditor({
      type: 'Sociogram',
      fields: { label: '' },
      existing: true,
      autoName: { propose: true },
    });

    await waitFor(() => expect(input).toHaveValue('Sociogram'));
  });

  it('leaves an existing stage with an empty name empty', async () => {
    // A hand-authored or migrated stage with no name is still not a stage
    // being created, and filling it in would be this editor putting a name
    // into a protocol nobody asked it to name.
    const { input } = renderEditor({
      type: 'Sociogram',
      fields: { label: '' },
      existing: true,
    });

    await settle();
    expect(input).toHaveValue('');
    fireEvent.blur(input);
    await settle();
    expect(input).toHaveValue('');
  });
});

/**
 * The same inputs Architect's own auto-namer was tested against, run through
 * the package hook end to end. The expected strings are Architect's, so this
 * fails if the move changed what any of the parts contribute to a name — not
 * only if one part in isolation changed.
 */
describe('useAutoStageName parity with Architect', () => {
  const cases: readonly Readonly<{
    name: string;
    type: StageType;
    fields: SectionDoc;
    panels?: readonly AutoStageNamePanel[];
    expected: string;
  }>[] = [
    {
      name: 'a subjectless name generator',
      type: 'NameGenerator',
      fields: { label: '' },
      expected: 'Form Name Generator',
    },
    {
      name: 'a name generator with a node subject',
      type: 'NameGenerator',
      fields: { label: '', subject: { entity: 'node', type: 'person' } },
      expected: 'Person Form Name Generator',
    },
    {
      name: 'network panels',
      type: 'NameGenerator',
      fields: { label: '' },
      panels: [{ dataSource: 'existing' }],
      expected: 'Form Name Generator with Network Panels',
    },
    {
      name: 'mixed panels',
      type: 'NameGeneratorQuickAdd',
      fields: { label: '' },
      panels: [{ dataSource: 'existing' }, { dataSource: 'roster-asset' }],
      expected: 'Quick Add Name Generator with Panels',
    },
    {
      name: 'a single nomination',
      type: 'FamilyPedigree',
      fields: { label: '', nominationPrompts: [{ variable: 'diabetes' }] },
      expected: 'Family Pedigree with Diabetes Nomination',
    },
    {
      name: 'a stage type with no qualifier',
      type: 'Sociogram',
      fields: { label: '', subject: { entity: 'edge', type: 'friendship' } },
      expected: 'Friendship Sociogram',
    },
  ];

  it.each(cases)('derives the same name for $name', async (testCase) => {
    const { input } = renderEditor({
      type: testCase.type,
      fields: testCase.fields,
      ...(testCase.panels === undefined
        ? {}
        : { autoName: { panels: testCase.panels } }),
    });

    await waitFor(() => expect(input).toHaveValue(testCase.expected));
  });
});
