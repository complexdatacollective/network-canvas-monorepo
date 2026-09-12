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
import ContentBlockEditor from '../content-blocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../content-blocks/ContentBlockPreview.tsx';
import { contentBlockSlots } from '../content-blocks/contentBlockTypes.ts';
import IntroductionSection from '../introduction/IntroductionSection.tsx';
import PageContentSection from '../page-content/PageContentSection.tsx';
import SortOrderRows from '../prompts/SortOrderRows.tsx';
import PromptsSection from '../PromptsSection.tsx';
import StageNameSection from '../stage-heading/StageNameSection.tsx';
import SubjectSection from '../subject-picker/SubjectSection.tsx';
import {
  TestItemEditor,
  TestItemPreview,
  TestPromptEditor,
  TestPromptPreview,
} from './rowFixtures.tsx';

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
          <StageNameSection />
          <PageContentSection
            ItemEditor={TestItemEditor}
            ItemPreview={TestItemPreview}
          />
        </>
      ),
    });

    expect(
      screen.getByRole('textbox', { name: 'Encabezado de página' }),
    ).toHaveValue('Welcome');
    expect(
      screen.getByRole('button', { name: 'Crear nuevo elemento de contenido' }),
    ).toBeInTheDocument();
    // The outline reads its state out of the same catalog, so a section named
    // in Spanish and reported in English would fail here rather than pass
    // halfway.
    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline()[1]).toEqual({
      title: 'Contenido de la página',
      state: 'Terminado',
    });
  });

  it('names the introduction section and its two fields', () => {
    renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      sections: <IntroductionSection />,
    });

    expect(screen.getByRole('textbox', { name: 'Título' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Presenta la tarea antes de que los participantes completen sus formularios.',
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
      await screen.findByRole('button', { name: 'Editar pregunta' }),
    ).toBeInTheDocument();
  });
});

/** The blocks as both of their consumers mount them. */
const pageOfBlocks = (
  <PageContentSection
    ItemEditor={ContentBlockEditor}
    ItemPreview={ContentBlockPreview}
    slots={contentBlockSlots}
  />
);

const introScreenOfBlocks = (
  <PageContentSection
    variant="introScreen"
    ItemEditor={ContentBlockEditor}
    ItemPreview={ContentBlockPreview}
    slots={contentBlockSlots}
  />
);

/** A page holding one passage of prose and one picture. */
const mediaPage = () => ({
  stage: {
    id: 'information-media-es',
    type: 'Information' as const,
    fields: {
      label: 'Information',
      title: 'Bienvenida',
      items: [
        { id: 'block-text', type: 'text', content: 'Lee esto.' },
        { id: 'block-image', type: 'asset', content: 'welcome_image' },
      ],
    },
  },
  assets: {
    welcome_image: {
      name: 'Welcome image',
      type: 'image',
      source: 'welcome.png',
    },
  },
  locale: 'es',
  sections: pageOfBlocks,
});

/**
 * The block editor, read in Spanish.
 *
 * Every branch of it says something different, and most of what it says only
 * appears when something is wrong — a kind nobody chose, a file nobody
 * supplied, a reference to a resource that is gone. So each is reached by
 * driving it rather than by asserting over a surface at rest.
 */
describe('the content-block dialog, read in Spanish', () => {
  it('names the dialog, the kinds it offers, and the guidance under them', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      locale: 'es',
      sections: pageOfBlocks,
    });

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo elemento de contenido',
      }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText('Detalles del elemento'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Elige el tipo de contenido, proporciona lo que verán los participantes y ajusta su presentación cuando sea posible.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Tipo de contenido')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Elige el tipo de contenido que mostrará este elemento.',
      ),
    ).toBeInTheDocument();
    for (const kind of ['Imagen', 'Vídeo', 'Audio', 'Texto']) {
      expect(
        within(dialog).getByRole('radio', { name: kind }),
      ).toBeInTheDocument();
    }
    expectNoLocaleLeaks('the content block dialog', researcherWords(harness));
  });

  it('refuses each kind of empty block in the researcher’s language', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      locale: 'es',
      sections: pageOfBlocks,
    });

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo elemento de contenido',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    const commit = async () => {
      await harness.user.click(
        within(dialog).getByRole('button', { name: 'Añadir' }),
      );
    };
    const chooseKind = async (kind: string) => {
      await harness.user.click(
        within(dialog).getByRole('radio', { name: kind }),
      );
    };

    // Nothing chosen at all: the block has no content control to refuse, so
    // the refusal belongs to the kind.
    await commit();
    expect(
      await within(dialog).findByText(
        'Elige qué tipo de contenido tiene este bloque.',
      ),
    ).toBeInTheDocument();

    await chooseKind('Imagen');
    expect(
      await within(dialog).findByText(
        'Proporciona el contenido de imagen para este elemento. Esto es lo que verán los participantes cuando lleguen a este elemento del estudio.',
      ),
    ).toBeInTheDocument();
    await commit();
    expect(
      await within(dialog).findByText(
        'Elige la imagen que muestra este bloque.',
      ),
    ).toBeInTheDocument();

    await chooseKind('Audio');
    expect(
      await within(dialog).findByText(
        'Proporciona el contenido de audio para este elemento. Esto es lo que verán los participantes cuando lleguen a este elemento del estudio.',
      ),
    ).toBeInTheDocument();
    await commit();
    expect(
      await within(dialog).findByText(
        'Elige el archivo de audio que reproduce este bloque.',
      ),
    ).toBeInTheDocument();

    await chooseKind('Vídeo');
    expect(
      await within(dialog).findByText(
        'Proporciona el contenido de video para este elemento. Esto es lo que verán los participantes cuando lleguen a este elemento del estudio.',
      ),
    ).toBeInTheDocument();
    await commit();
    expect(
      await within(dialog).findByText(
        'Elige el vídeo que reproduce este bloque.',
      ),
    ).toBeInTheDocument();

    await chooseKind('Texto');
    expect(
      await within(dialog).findByText(
        'Proporciona el contenido de texto para este elemento. Esto es lo que verán los participantes cuando lleguen a este elemento del estudio.',
      ),
    ).toBeInTheDocument();
    // The prose control carries its placeholder as `aria-placeholder`, which
    // is what a researcher reads while the block is still empty.
    expect(
      await within(dialog).findByRole('textbox', { name: 'Contenido' }),
    ).toHaveAttribute(
      'aria-placeholder',
      'Introduce el texto de este bloque...',
    );
    await commit();
    expect(
      await within(dialog).findByText(
        'Escribe el texto que muestra este bloque.',
      ),
    ).toBeInTheDocument();
  });

  it('names the display sizes a picture on a page may be drawn at', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Editar elemento' }))[1]!,
    );
    const dialog = await screen.findByRole('dialog');

    expect(
      await within(dialog).findByText('Tamaño de visualización'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Puedes limitar la altura de este elemento. El tamaño completo permite mostrarlo con su altura natural.',
      ),
    ).toBeInTheDocument();
    for (const size of ['Tamaño completo', 'Pequeño', 'Mediano', 'Grande']) {
      expect(
        within(dialog).getByRole('radio', { name: size }),
      ).toBeInTheDocument();
    }
  });
});

/**
 * The live region of the block editor, read in Spanish.
 *
 * Choosing or changing a block's kind swaps a whole required control, and
 * these four sentences are the only thing that says so to anyone not watching
 * it happen. Scoped to the dialog: the list beneath it reports its own changes
 * through a live region of its own.
 */
describe('what a Spanish screen reader is told when a block changes type', () => {
  const status = () =>
    within(screen.getByRole('dialog')).getByRole('status').textContent;

  it('names the control that has just appeared on a new block', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo elemento de contenido',
      }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: 'Texto' }),
    );

    await waitFor(() =>
      expect(status()).toBe(
        'Tipo de contenido definido como Texto. Se ha añadido debajo un campo de contenido para él.',
      ),
    );
  });

  it('walks a saved block through all three outcomes for its draft', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Editar elemento' }))[1]!,
    );
    await screen.findByRole('radio', { name: 'Imagen' });

    await harness.user.click(screen.getByRole('radio', { name: 'Texto' }));
    await waitFor(() =>
      expect(status()).toBe(
        'El tipo de contenido ha cambiado a Texto. El contenido que introdujiste para el tipo anterior se conserva, y vuelve si cambias otra vez a él.',
      ),
    );

    await harness.user.click(screen.getByRole('radio', { name: 'Imagen' }));
    await waitFor(() =>
      expect(status()).toBe(
        'El tipo de contenido ha cambiado a Imagen. Se ha restaurado el contenido que introdujiste antes para Imagen.',
      ),
    );

    await harness.user.click(screen.getByRole('radio', { name: 'Texto' }));
    await waitFor(() => expect(status()).toContain('cambiado a Texto'));
    await harness.user.click(screen.getByRole('radio', { name: 'Audio' }));
    await waitFor(() =>
      expect(status()).toBe(
        'El tipo de contenido ha cambiado a Audio. Todavía no has introducido nada para Audio.',
      ),
    );
  });
});

/**
 * A block the page cannot show, read in Spanish.
 *
 * Three separate things are wrong here and each has its own sentence: a
 * reference to a resource that has been deleted, a reference to one the
 * protocol still holds but a page cannot present, and a block whose content
 * nobody has supplied at all.
 */
describe('a block a page cannot show, read in Spanish', () => {
  /** `geo_data` is a map layer the shared fixture protocol really holds. */
  const brokenPage = () => ({
    stage: {
      id: 'information-broken-es',
      type: 'Information' as const,
      fields: {
        label: 'Information',
        title: 'Bienvenida',
        items: [
          {
            id: 'block-missing',
            type: 'asset',
            content: 'retirada_del_protocolo',
          },
          { id: 'block-layer', type: 'asset', content: 'geo_data' },
          { id: 'block-empty', type: 'asset', content: '' },
        ],
      },
    },
    locale: 'es',
    sections: pageOfBlocks,
  });

  it('says in the list which blocks hold nothing and which hold the wrong thing', async () => {
    renderStageEditor(brokenPage());

    expect(
      await screen.findAllByText(
        'El recurso de este bloque no está en este protocolo, o no es algo que una página pueda mostrar.',
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText('Este bloque todavía no tiene contenido.'),
    ).toBeInTheDocument();
  });

  it('tells a researcher whose resource is gone that it is gone', async () => {
    const harness = renderStageEditor(brokenPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Editar elemento' }))[0]!,
    );
    const dialog = await screen.findByRole('dialog');

    expect(
      await within(dialog).findByText('Este bloque no se puede mostrar'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'El recurso de este elemento ya no está en el protocolo. Elige un tipo de contenido arriba para sustituirlo.',
      ),
    ).toBeInTheDocument();
  });

  it('tells a researcher whose resource is the wrong kind exactly that', async () => {
    const harness = renderStageEditor(brokenPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Editar elemento' }))[1]!,
    );
    const dialog = await screen.findByRole('dialog');

    expect(
      await within(dialog).findByText(
        'El recurso de este elemento no es un archivo de imagen, audio o vídeo, por lo que el elemento no puede mostrarlo. Elige un tipo de contenido arriba para sustituirlo.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The page list itself, read in Spanish: what it says while it holds nothing,
 * what it calls the dialog that changes a block, and what it refuses a save
 * with.
 */
describe('the page-content list, read in Spanish', () => {
  it('names the dialog that edits a block already on the page', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      locale: 'es',
      sections: pageOfBlocks,
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Editar elemento' }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Editar elemento')).toBeInTheDocument();
  });

  it('refuses in Spanish to save a page that shows the participant nothing', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-empty-es',
        type: 'Information' as const,
        fields: { label: 'Information', title: 'Bienvenida', items: [] },
      },
      locale: 'es',
      sections: pageOfBlocks,
    });

    expect(
      await screen.findByText(
        'Todavía no se han creado elementos. Pulsa «Crear nuevo elemento de contenido» para añadir texto o medios.',
      ),
    ).toBeInTheDocument();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Añade al menos un bloque. Una página sin contenido no muestra nada al participante.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The same section as the page above, saying the other set of words: an
 * introduction screen is a page shown BEFORE a task rather than the step of
 * the interview itself, and the two read differently rather than differing by
 * a noun.
 */
describe('the introduction-screen variant, read in Spanish', () => {
  const pedigreeWithAnIntroduction = () => ({
    stage: {
      id: 'family-pedigree-intro-es',
      type: 'FamilyPedigree' as const,
      fields: {
        label: 'Family Pedigree',
        framing: { mode: 'fixed', value: 'gamete' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        introScreen: {
          items: [{ id: 'intro-text', type: 'text', content: 'Lee esto.' }],
        },
      },
    },
    locale: 'es',
    sections: introScreenOfBlocks,
  });

  it('names the section, its list and the dialogs that fill it', async () => {
    const harness = renderStageEditor(pedigreeWithAnIntroduction());

    expect(
      await screen.findByRole('switch', { name: 'Pantalla de introducción' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Muestra al participante una pantalla de texto y medios antes de que empiece esta tarea.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Bloques de introducción')).toBeInTheDocument();
    expect(
      screen.getByText(
        'El participante los recorre en este orden antes de empezar la tarea. Arrástralos para reordenarlos.',
      ),
    ).toBeInTheDocument();
    // The row noun reaches the shared list as a descriptor, so this is where
    // an English noun inside a Spanish sentence would appear.
    expect(
      await screen.findByRole('button', {
        name: 'Editar bloque de introducción',
      }),
    ).toBeInTheDocument();

    expectNoLocaleLeaks(
      'the introduction screen at rest',
      researcherWords(harness),
    );

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Crear nuevo bloque de introducción',
      }),
    );
    expect(
      await screen.findByText('Crear bloque de introducción'),
    ).toBeInTheDocument();
    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      screen.getByRole('button', { name: 'Editar bloque de introducción' }),
    );
    expect(
      await screen.findByText('Editar bloque de introducción'),
    ).toBeInTheDocument();
  });

  it('asks in Spanish before throwing the whole introduction away', async () => {
    const harness = renderStageEditor(pedigreeWithAnIntroduction());

    const capability = await screen.findByRole('switch', {
      name: 'Pantalla de introducción',
    });
    await harness.user.click(capability);

    expect(
      await screen.findByText('Esto eliminará la pantalla de introducción'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Esto eliminará todos los bloques de la pantalla de introducción, y el participante empezará la tarea directamente. ¿Quieres continuar?',
      ),
    ).toBeInTheDocument();
    const confirm = screen.getByRole('button', {
      name: 'Eliminar la pantalla de introducción',
    });
    // The cancel verb comes from the shared common.* catalog rather than from
    // this package, so this fails if the common layer stopped reaching the
    // merge.
    expect(
      screen.getByRole('button', { name: 'Cancelar' }),
    ).toBeInTheDocument();
    expectNoLocaleLeaks(
      'the clear-the-introduction confirmation',
      researcherWords(harness),
    );

    // Switched off, then on again: what a researcher who has just discarded
    // their introduction and reached for the Add button reads.
    await harness.user.click(confirm);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: 'Editar bloque de introducción',
        }),
      ).toBeNull(),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Pantalla de introducción' }),
    );

    expect(
      await screen.findByText(
        'Todavía no hay bloques. Crea uno para explicar esta tarea antes de que el participante la empiece.',
      ),
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
          label: 'Name Generator',
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
        'Crea al menos una pregunta. Una etapa sin preguntas no le pregunta nada al participante.',
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
        label: 'Sociograma',
        subject: { entity: 'node', type: 'person' },
        background: { concentricCircles: 4, skewedTowardCenter: true },
        behaviours: { automaticLayout: true },
        prompts: [
          {
            id: 'sociogram-prompt-1',
            text: 'Coloca juntas a las personas que se conocen',
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
      await screen.findByRole('button', { name: 'Editar pregunta' }),
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
      await screen.findByRole('button', { name: 'Editar pregunta' }),
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
