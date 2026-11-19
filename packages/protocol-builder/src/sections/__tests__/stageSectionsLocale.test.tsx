import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import type { SortableProperty } from '../../fields/sortOrderOptions.ts';
import type { RowEditorProps } from '../../form/rowDialog.tsx';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import IntroductionSection from '../introduction/IntroductionSection.tsx';
import { pageContent } from '../page-content/pageContent.tsx';
import PageContentSection from '../page-content/PageContentSection.tsx';
import SortOrderRows from '../prompts/SortOrderRows.tsx';
import PromptsSection from '../PromptsSection.tsx';
import SubjectSection from '../subject-picker/SubjectSection.tsx';
import { TestPromptEditor, TestPromptPreview } from './rowFixtures.tsx';

/**
 * Copy in the fixture protocol's only language, as schema 9 holds it. The
 * words are Spanish because this file reads the editor in Spanish; the
 * protocol's language is a separate thing.
 */
const inProtocolLanguage = (text: string) => ({ 'en-US': text });

/**
 * The six areas the shared stage-editor sections add, read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. These are the tests that mount one, and they exist to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, that the catalog a host merges
 * is the catalog it reads, and that a value the researcher supplied is spliced
 * into the translated sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */

/**
 * Everything on screen that belongs to the researcher rather than to this
 * package: the whole protocol the harness is mounted over, the stage's own
 * seeded fields, and the codebook the sections read type and attribute names
 * out of.
 *
 * The same shape `src/__tests__/localeSweep.test.tsx` uses, and read out of the
 * documents the harness mounts rather than listed by hand, so a fixture that
 * gains a stage or an attribute cannot quietly widen the sweep's blind spot —
 * or start failing it.
 */
const researcherWords = (harness: StageEditorHarness) =>
  protocolStrings(
    harness.protocolSections(),
    harness.seeded.fields,
    harness.hostCodebook(),
  );

describe('the shared stage sections, read in Spanish', () => {
  it('names the page-content section and its controls', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      locale: 'es',
      sections: (
        <>
          <PageContentSection />
        </>
      ),
    });

    const editor = await screen.findByRole('textbox', {
      name: 'Contenido de la página',
    });
    expect(editor).toHaveTextContent('Welcome');
    expect(editor).toHaveTextContent('Welcome to this interview.');
    // The section the editor publishes to its host carries the SAME title the
    // card shows, so a section named in Spanish on screen and published in
    // English would fail here rather than pass halfway. Its state is the
    // harness's own English reading of the store — the words belong to
    // whichever host draws the list, not to this package.
    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]).toEqual({
      title: 'Contenido de la página',
      state: 'Finished',
    });
  });

  it('names the introduction section and its two fields', () => {
    renderStageEditor({
      stageId: 'ego-form-1',
      locale: 'es',
      sections: <IntroductionSection />,
    });

    expect(screen.getByRole('textbox', { name: 'Título' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Presenta la tarea antes de que quienes participan completen sus formularios.',
      ),
    ).toBeInTheDocument();
  });

  it('names the subject section per entity', () => {
    renderStageEditor({
      stageId: 'name-generator-1',
      locale: 'es',
      sections: <SubjectSection entity="node" />,
    });

    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
    expect(
      screen.getByText('Selecciona el tipo de nodo que creará esta etapa.'),
    ).toBeInTheDocument();
  });

  it('names a prompt list and the affordances on its rows', async () => {
    renderStageEditor({
      stageId: 'name-generator-1',
      locale: 'es',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
        />
      ),
    });

    expect(
      screen.getByRole('button', { name: 'Crear nueva pregunta' }),
    ).toBeInTheDocument();
    // The row noun travels into the shared list as a descriptor rather than as
    // a word, so this is where an English noun in a Spanish sentence would
    // show up.
    expect(
      await screen.findByRole('button', { name: 'Edit pregunta' }),
    ).toBeInTheDocument();
  });
});

/**
 * A page, written as one text, with the files its blocks name.
 *
 * Through `pageContent` rather than by mounting the shared section by hand:
 * the pairing an interface composes is that function's business.
 */
const pageOf = (id: string, content: string) => ({
  stage: {
    id,
    type: 'Information' as const,
    fields: {
      label: inProtocolLanguage('Information'),
      content: inProtocolLanguage(content),
    },
  },
  locale: 'es',
  sections: pageContent()(),
});

/**
 * A block the page cannot show, read in Spanish.
 *
 * Two separate things are wrong here and read the same to a participant but
 * not to the researcher's eye: a reference to a resource that has been
 * deleted, and a reference to one the protocol still holds but a page cannot
 * present. `geo_data` is a map layer the shared fixture protocol really holds.
 */
describe('a block a page cannot show, read in Spanish', () => {
  const UNUSABLE =
    'El recurso de este bloque no está en este protocolo, o no es algo que una página pueda mostrar.';

  it('says which blocks name a resource that is gone or is not a file a page shows', async () => {
    renderStageEditor(
      pageOf(
        'information-broken-es',
        [
          'Bienvenida',
          '![](asset:retirada_del_protocolo)',
          '![](asset:geo_data)',
        ].join('\n\n'),
      ),
    );

    expect(await screen.findAllByText(UNUSABLE)).toHaveLength(2);
  });

  it('says nothing of a block that names a file the page can show', async () => {
    renderStageEditor({
      ...pageOf(
        'information-fine-es',
        'Bienvenida\n\n![](asset:welcome_image)',
      ),
      assets: {
        welcome_image: {
          name: 'Welcome image',
          type: 'image',
          source: 'welcome.png',
        },
      },
    });

    await screen.findByRole('textbox', { name: 'Contenido de la página' });
    expect(screen.queryByText(UNUSABLE)).toBeNull();
  });
});

/**
 * What the page-content section refuses a save with, in Spanish: a page with
 * nothing in it shows the participant nothing.
 */
describe('the page-content section, read in Spanish', () => {
  it('refuses in Spanish to save a page that shows the participant nothing', async () => {
    const harness = renderStageEditor(pageOf('information-empty-es', ''));

    await screen.findByRole('textbox', { name: 'Contenido de la página' });
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        /Esta etapa no está terminada, así que no se ha guardado\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Contenido de la página' }),
    ).toBeInTheDocument();
  });
});

/**
 * The prompts section, read in Spanish in the two states nothing at rest can
 * reach: waiting on a subject nobody has chosen, and refusing a stage that
 * asks the participant nothing.
 */
describe('the prompts section, read in Spanish', () => {
  it('reads in Spanish, and offers no way in, before a subject is chosen', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGenerator', position: 0 },
      locale: 'es',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
        />
      ),
    });

    // Architect keeps one sentence for both states and only switches the
    // section off, so this is the section's own description, in Spanish, with
    // the way in unusable.
    expect(
      await screen.findByText(
        'Crea y ordena las preguntas que se muestran en esta etapa.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear nueva pregunta' }),
    ).toBeDisabled();
    expectNoLocaleLeaks(
      'the prompts section waiting on a subject',
      researcherWords(harness),
    );
  });

  it('refuses in Spanish to save a stage that asks nothing', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'name-generator-empty-es',
        type: 'NameGenerator' as const,
        fields: {
          label: inProtocolLanguage('Name Generator'),
          subject: { entity: 'node', type: 'person' },
          prompts: [],
        },
      },
      locale: 'es',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
        />
      ),
    });

    expect(
      await screen.findByText('Todavía no se ha creado ningún elemento.'),
    ).toBeInTheDocument();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Crea al menos una pregunta. Una etapa sin preguntas no le pregunta nada a la persona participante.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * A prompt's sort rules, read in Spanish.
 *
 * The two column headings, the two directions on offer, and the refusal a rule
 * left pointing at a deleted attribute earns — which is the only part of this
 * a researcher cannot see until they try to save.
 */
describe('a prompt’s sort rules, read in Spanish', () => {
  /**
   * What a person may be sorted by, as a family would hand them over. Written
   * out rather than read from the codebook because the question here is what
   * the shared rows SAY, not which properties a family offers.
   */
  const PERSON_PROPERTIES: readonly SortableProperty[] = [
    { value: 'name', label: 'name', type: 'text' },
  ];

  /** A rule naming an attribute this subject does not have. */
  const ORPHANED_PROPERTY = 'nickname';

  function SortOrderPromptEditor({ item }: RowEditorProps) {
    return (
      <>
        <Field
          name="text"
          label="Texto de la pregunta"
          component={InputField}
        />
        <SortOrderRows
          name="sortOrder"
          title="Ordenar los nodos sin colocar"
          description="Elige el orden en que se entregan los nodos que el participante todavía no ha colocado."
          label="Reglas de orden"
          hint="Las reglas se aplican en orden."
          addButtonLabel="Añadir una regla de orden"
          emptyStateMessage="Todavía no hay reglas."
          properties={PERSON_PROPERTIES}
          committedRules={item.sortOrder}
        />
      </>
    );
  }

  const sociogramWithADanglingRule = () => ({
    stage: {
      id: 'sociogram-sort-es',
      type: 'Sociogram' as const,
      fields: {
        label: inProtocolLanguage('Sociograma'),
        subject: { entity: 'node', type: 'person' },
        background: { concentricCircles: 4, skewedTowardCenter: true },
        behaviours: { automaticLayout: true },
        prompts: [
          {
            id: 'sociogram-prompt-1',
            text: inProtocolLanguage(
              'Coloca juntas a las personas que se conocen',
            ),
            layout: { layoutVariable: 'layout' },
            sortOrder: [{ property: ORPHANED_PROPERTY, direction: 'asc' }],
          },
        ],
      },
    },
    locale: 'es',
    sections: (
      <PromptsSection
        PromptEditor={SortOrderPromptEditor}
        PromptPreview={TestPromptPreview}
      />
    ),
  });

  it('names both columns and both directions', async () => {
    const harness = renderStageEditor(sociogramWithADanglingRule());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit pregunta' }),
    );
    await screen.findByRole('dialog');

    const property = await screen.findByRole('combobox', {
      name: 'Propiedad',
    });
    expect(property).toHaveValue(ORPHANED_PROPERTY);
    const direction = screen.getByRole('combobox', { name: 'Dirección' });
    expect(
      within(direction).getByRole('option', { name: 'Ascendente' }),
    ).toBeInTheDocument();
    expect(
      within(direction).getByRole('option', { name: 'Descendente' }),
    ).toBeInTheDocument();
  });

  it('refuses a rule pointing at an attribute the codebook has lost', async () => {
    const harness = renderStageEditor(sociogramWithADanglingRule());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit pregunta' }),
    );
    await screen.findByRole('dialog');
    await harness.user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(
        'Esta regla apunta a un atributo que ya no está en el libro de códigos. Elige otro o elimina la regla.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The subject section's other half, read in Spanish.
 *
 * A whole second set of sentences rather than the node ones with a noun
 * swapped, which is the point of writing them per subject: an edge is a
 * relationship rather than a member, and the section is the one place a
 * researcher is told what the stage is about.
 */
describe('the subject section’s edge wording, read in Spanish', () => {
  it('names an edge subject and the type it offers to create', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-edge-form-1',
      locale: 'es',
      sections: <SubjectSection entity="edge" />,
    });

    expect(
      screen.getByText('Elige el tipo de vínculo que utiliza esta etapa.'),
    ).toBeInTheDocument();
    expectNoLocaleLeaks('the edge subject section', researcherWords(harness));

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo tipo de vínculo',
      }),
    );

    // The same words title the dialog the button opens, so a section that
    // named the button out of the catalog and the dialog out of a literal
    // would fail here rather than halfway.
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Crear nuevo tipo de vínculo'),
    ).toBeInTheDocument();
  });
});
