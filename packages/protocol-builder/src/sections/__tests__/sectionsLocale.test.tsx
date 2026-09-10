import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import FormFieldsSection from '../FormFieldsSection.tsx';
import InterviewerGuidanceSection from '../InterviewerGuidanceSection.tsx';
import NetworkFilterSection from '../NetworkFilterSection.tsx';
import SkipLogicSection from '../SkipLogicSection.tsx';

/**
 * The three sections every stage editor composes, read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so each section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. These are the tests that mount one, and they are what proves
 * the wiring: a section still holding an English literal, or one whose ids
 * never reached `src/locales/es.json`, shows up here as an English string
 * where a Spanish one was asked for. The harness merges the three catalogs a
 * host merges, in the order a host merges them, so a section that takes its
 * confirmation's cancel verb from `common.*` is read here over the layer a host
 * would actually serve it from.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the section read. `intl.formatMessage(messages.title)` would pass
 * whatever the catalog said, including nothing at all.
 */

/**
 * Everything on screen that belongs to the researcher rather than to this
 * package: the whole protocol the harness is mounted over, the stage's own
 * seeded fields, and the codebook the sections read type and attribute names
 * out of.
 *
 * Read out of the documents the harness mounts rather than listed by hand, so a
 * fixture that gains a stage or an attribute cannot quietly widen the sweep's
 * blind spot — or start failing it.
 */
const researcherWords = (harness: StageEditorHarness) =>
  protocolStrings(
    harness.protocolSections(),
    harness.seeded.fields,
    harness.hostCodebook(),
  );

/**
 * The fixture's alter form with the three shared sections on it.
 *
 * That stage holds no filter, no skip logic and no guidance, so each of the
 * three opens from the closed state a researcher meets it in — which is what
 * the tests below drive.
 */
const renderInSpanish = () =>
  renderStageEditor({
    stageId: 'alter-form-1',
    locale: 'es',
    sections: (
      <>
        <NetworkFilterSection subject="node" />
        <SkipLogicSection />
        <InterviewerGuidanceSection />
      </>
    ),
  });

describe('the shared stage-editor sections in Spanish', () => {
  it('ships Spanish for the ids these sections declare', () => {
    // Checked first so a merge that has not landed this directory's catalog
    // entries fails saying so, rather than as an unexplained English string.
    expect(Object.keys(protocolBuilderCatalogs.es ?? {})).toEqual(
      expect.arrayContaining([
        'protocolBuilder.networkFilter.title',
        'protocolBuilder.networkFilter.nodeRulesHint',
        'protocolBuilder.skipLogic.title',
        'protocolBuilder.interviewerGuidance.title',
      ]),
    );
  });

  it('names each section in Spanish', () => {
    renderInSpanish();

    expect(
      screen.getByRole('switch', { name: 'Filtro de la etapa' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Lógica de salto' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', {
        name: 'Guía para quien realiza la entrevista',
      }),
    ).toBeInTheDocument();
  });

  it('describes each section in Spanish', () => {
    const harness = renderInSpanish();

    expect(
      screen.getByText(
        'Crea reglas que limiten qué nodos están disponibles en esta etapa.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Determina si se muestra esta etapa y dónde continúa la entrevista cuando se omite.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Crea notas o una guía para quien realiza la entrevista.',
      ),
    ).toBeInTheDocument();
    // The assertions above name what these sections are supposed to say; the
    // sweep reports whatever else they said — including a sentence rebuilt out
    // of an English pattern, which matches no whole message.
    expectNoLocaleLeaks('the closed sections', researcherWords(harness));
  });

  it('labels the controls inside a section in Spanish', async () => {
    const harness = renderInSpanish();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Lógica de salto' }),
    );

    // The section's own words, and the destination field's, which the section
    // hands to a field this directory does not own — so an English label here
    // would mean the section's copy stopped where the field begins.
    expect(await screen.findByText('Acción')).toBeInTheDocument();
    expect(screen.getByText('Mostrar esta etapa')).toBeInTheDocument();
    expect(screen.getByText('Cuando se omita esta etapa')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Elige dónde debe continuar la entrevista. Solo se pueden seleccionar etapas posteriores.',
      ),
    ).toBeInTheDocument();
    expectNoLocaleLeaks(
      'the open skip-logic section',
      researcherWords(harness),
    );
  });

  it('asks in Spanish before throwing a capability’s content away', async () => {
    const harness = renderInSpanish();

    const guidance = screen.getByRole('switch', {
      name: 'Guía para quien realiza la entrevista',
    });
    await harness.user.click(guidance);
    const field = await screen.findByRole('textbox', {
      name: 'Texto del guion de la entrevista',
    });
    await harness.user.click(field);
    await harness.user.keyboard('Pregunta con calma.');
    await harness.user.click(guidance);

    // The confirmation is the capability's own words, formatted by
    // BuilderSection out of the descriptors the section handed it — a string
    // prop here would have left this dialog English.
    expect(
      await screen.findByText('Se borrará el guion de la entrevista'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Borrar guion' }),
    ).toBeInTheDocument();
    // And the cancel verb comes from the shared common.* catalog rather than
    // from this package, so this fails if the common layer stopped reaching
    // the merge.
    expect(
      screen.getByRole('button', { name: 'Cancelar' }),
    ).toBeInTheDocument();
    expectNoLocaleLeaks('the discard confirmation', researcherWords(harness));
  });
});

/**
 * The form-fields section read in Spanish.
 *
 * The other shared sections are swept in `stageSectionsLocale.test.tsx`. This
 * one is here because it is the only surface in the package that splices a
 * researcher's own attribute name into a sentence.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the form-fields section, read in Spanish', () => {
  it('splices a researcher’s own attribute into the Spanish sentence', async () => {
    renderStageEditor({
      stageId: 'alter-form-1',
      locale: 'es',
      sections: <FormFieldsSection subject="node" hasTitle />,
    });

    expect(
      screen.getByRole('textbox', { name: 'Título del formulario' }),
    ).toBeInTheDocument();
    // `previewCollects` carries two values the protocol supplied. Asserted on
    // the whole rendered sentence, so a placeholder left out of the Spanish
    // fails here rather than rendering as `{name}`.
    expect(
      await screen.findByText('Recoge «relationship_to_ego» como text.'),
    ).toBeInTheDocument();
  });

  /**
   * The one decision this section exists to ask, and the control that follows
   * from it.
   *
   * Both used to be labelled with the schema's own tokens — `text`,
   * `datetime`, `RelativeDatePicker` — in every language, while everything
   * else in the same dialog was translated. No guard in the package could see
   * it: a string with no descriptor behind it is invisible to `checkFullLocale`,
   * to the copy scan and to the sweep alike, which is why the whole list is
   * read here rather than one entry of it.
   */
  it('names every kind of answer and every input control', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      locale: 'es',
      sections: <FormFieldsSection subject="node" hasTitle />,
    });

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo campo de formulario',
      }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Atributo' }),
      '#create-new-attribute',
    );

    const kind = await dialog.findByRole('combobox', {
      name: 'Tipo de respuesta',
    });
    expect(
      within(kind)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Selecciona una opción…',
      'Texto',
      'Número',
      'Booleano',
      'Ordinal',
      'Categórico',
      'Escalar',
      'Fecha',
    ]);

    // And the controls each kind can be collected with, which read
    // `DatePicker` / `RelativeDatePicker` / `VisualAnalogScale` to every
    // reader. Read per kind rather than once, because the list the control
    // offers is what the kind decides.
    const controlsFor = async (type: string) => {
      await harness.user.selectOptions(kind, type);
      const control = await dialog.findByRole('combobox', {
        name: 'Control de entrada',
      });
      return (
        within(control)
          .getAllByRole('option')
          .map((option) => option.textContent)
          // The select keeps its placeholder while the kind it was answering
          // for has been replaced; the controls are what is being read here.
          .filter((label) => label !== 'Selecciona una opción…')
      );
    };

    expect(await controlsFor('datetime')).toEqual([
      'Selector de fecha',
      'Selector de fecha relativa',
    ]);
    expect(await controlsFor('text')).toEqual([
      'Campo de texto',
      'Área de texto',
    ]);
    expect(await controlsFor('number')).toEqual(['Campo numérico']);
    expect(await controlsFor('boolean')).toEqual([
      'Botones de sí o no',
      'Interruptor',
    ]);

    // A scale is not invented from a name and a kind — its two end labels are
    // part of it — so choosing that kind offers the codebook editor instead of
    // a control to pick, and both sentences that say so are read here.
    await harness.user.selectOptions(kind, 'scalar');
    expect(
      await dialog.findByRole('button', {
        name: 'Crear este atributo y lo que acepta',
      }),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        'Un atributo que se responde en una escala necesita una etiqueta en cada extremo, así que se crea junto con ellas.',
      ),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole('combobox', { name: 'Control de entrada' }),
    ).toBeNull();

    // The control a scale IS collected with still has to be named, so it is
    // read from a scale the codebook already holds — which is the only place
    // that list appears now.
    seedPersonVariables(harness, {
      closeness: {
        name: 'closeness',
        type: 'scalar',
        parameters: { minLabel: 'Nada cerca', maxLabel: 'Muy cerca' },
      },
    });
    await chooseAttribute(harness, dialog, 'closeness');
    const scaleControls = await dialog.findByRole('combobox', {
      name: 'Control de entrada',
    });
    expect(
      within(scaleControls)
        .getAllByRole('option')
        .map((option) => option.textContent)
        .filter((label) => label !== 'Selecciona una opción…'),
    ).toEqual(['Escala analógica visual']);
  });
});

/**
 * The rest of the form-fields surface, read in Spanish: the row dialog, the
 * codebook doors it opens, and every sentence that only appears when something
 * is wrong.
 *
 * A refusal is the half of a surface a positive test never reaches — nothing
 * renders "Elige el atributo que recoge este campo." until a researcher tries
 * to save a field that collects nothing — so each one below is reached by
 * doing the thing that earns it rather than by rendering the component and
 * looking for a string.
 *
 * The words are asserted as literals rather than by re-formatting the
 * descriptor the component read, for the reason given above: a formatted
 * assertion passes over an empty catalog.
 *
 * Two sentences used to be listed here as unreachable and are not:
 * `formFields.componentRequired` is what the dialog says when the attribute a
 * field collects has no input control to offer — read below — and
 * `codebookEditing.unsupportedControl` is read in
 * `fields/__tests__/VariablePickerField.test.tsx`, where a host asks the codebook for an
 * attribute its control cannot collect.
 */
const PERSON_TYPE_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'person',
});

/** The fixture's alter form, mounted with only the section under test. */
const alterFormInSpanish = () =>
  renderStageEditor({
    stageId: 'alter-form-1',
    locale: 'es',
    sections: <FormFieldsSection subject="node" />,
  });

/** Opens one row's dialog. Several rows carry the same affordance, so which. */
const openFieldDialog = async (
  harness: StageEditorHarness,
  name: string,
  index = 0,
) => {
  const trigger = screen.getAllByRole('button', { name })[index];
  if (trigger === undefined) throw new Error(`There is no "${name}" ${index}.`);
  await harness.user.click(trigger);
  return within(await screen.findByRole('dialog'));
};

/**
 * Puts attributes on the person type as a collaborator would.
 *
 * Through the HOST, so what the section then reads is a codebook a real
 * protocol could hold: the fixture happens to declare no date attribute a form
 * may collect, and no attribute the schema accepts but the codebook editor
 * cannot rewrite, and both are states a researcher's own protocol reaches.
 */
const seedPersonVariables = (
  harness: StageEditorHarness,
  variables: Readonly<Record<string, SectionDoc>>,
) => {
  const person = harness.protocolSections()[PERSON_TYPE_SECTION];
  if (person === undefined) throw new Error('the person type is gone');
  const existing = person.variables;
  harness.receiveCodebookUpdate({
    node: {
      person: {
        ...person,
        variables: {
          ...(typeof existing === 'object' && existing !== null
            ? existing
            : {}),
          ...variables,
        },
      },
    },
  });
};

/**
 * Chooses the attribute a field collects, once the picker is offering it.
 *
 * A codebook change reaches a subscribed component on a microtask, so an
 * attribute seeded a line above is not on the picker the moment the seeding
 * call returns.
 */
const chooseAttribute = async (
  harness: StageEditorHarness,
  dialog: ReturnType<typeof within>,
  name: string,
) => {
  const picker = dialog.getByRole('combobox', { name: 'Atributo' });
  await within(picker).findByRole('option', { name });
  await harness.user.selectOptions(picker, name);
};

/**
 * Writes the question a field asks.
 *
 * Typed rather than set, because the question is a rich-text editor: it takes
 * keystrokes through the caret, and `type()` on the element does nothing.
 */
const writeQuestion = async (
  harness: StageEditorHarness,
  dialog: ReturnType<typeof within>,
  question: string,
) => {
  await harness.user.click(
    dialog.getByRole('textbox', { name: 'Texto de la pregunta' }),
  );
  await harness.user.keyboard(question);
};

/** Fills in a field collecting a plain text attribute nobody has declared. */
const inventAttribute = async (
  harness: StageEditorHarness,
  attributeName: string,
) => {
  const dialog = await openFieldDialog(
    harness,
    'Crear nuevo campo de formulario',
  );
  await harness.user.selectOptions(
    dialog.getByRole('combobox', { name: 'Atributo' }),
    '#create-new-attribute',
  );
  await harness.user.type(
    await dialog.findByRole('textbox', { name: 'Nombre del atributo' }),
    attributeName,
  );
  await harness.user.selectOptions(
    dialog.getByRole('combobox', { name: 'Tipo de respuesta' }),
    'text',
  );
  await writeQuestion(harness, dialog, '¿Cómo lo llaman?');
  await harness.user.click(dialog.getByRole('button', { name: 'Añadir' }));
  return dialog;
};

/** Adds one value to the list the codebook editor is showing. */
const addValue = async (
  harness: StageEditorHarness,
  position: number,
  label: string,
  value: string,
) => {
  await harness.user.click(
    screen.getByRole('button', { name: 'Añadir opción' }),
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Etiqueta de la opción ${position}` }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Valor de la opción ${position}` }),
    value,
  );
};

describe('the form-fields row dialog, read in Spanish', () => {
  it('shows its examples and asks for what a field needs', async () => {
    const harness = alterFormInSpanish();
    const dialog = await openFieldDialog(
      harness,
      'Crear nuevo campo de formulario',
    );

    // Both examples reach the screen as `aria-placeholder`: the two questions
    // are rich-text editors rather than inputs, and a contenteditable surface
    // has no `placeholder` attribute to carry one.
    expect(
      dialog.getByRole('textbox', { name: 'Texto de la pregunta' }),
    ).toHaveAttribute('aria-placeholder', '¿Cómo se llama esta persona?');
    expect(
      dialog.getByRole('textbox', { name: 'Texto de ayuda' }),
    ).toHaveAttribute(
      'aria-placeholder',
      'Selecciona todas las que correspondan',
    );

    await harness.user.click(dialog.getByRole('button', { name: 'Añadir' }));

    expect(
      await dialog.findByText('Elige el atributo que recoge este campo.'),
    ).toBeInTheDocument();
    expect(
      dialog.getByText('Escribe la pregunta que hace este campo.'),
    ).toBeInTheDocument();
  });

  it('asks for the facts an invented attribute needs', async () => {
    const harness = alterFormInSpanish();
    const dialog = await openFieldDialog(
      harness,
      'Crear nuevo campo de formulario',
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Atributo' }),
      '#create-new-attribute',
    );

    // An example of a name, translated as one — not a value that is stored.
    expect(
      await dialog.findByRole('textbox', { name: 'Nombre del atributo' }),
    ).toHaveAttribute('placeholder', 'Apodo');

    await harness.user.click(dialog.getByRole('button', { name: 'Añadir' }));

    expect(
      await dialog.findByText(
        'Elige qué tipo de respuesta contiene este atributo.',
      ),
    ).toBeInTheDocument();
    expect(
      dialog.getByText('Da nombre al atributo que recoge este campo.'),
    ).toBeInTheDocument();
  });

  /**
   * A categorical attribute IS its list of answers, so it cannot be made from
   * a name and a kind — and the sentence that says so has to say what to press
   * instead, which is the button beside it.
   */
  it('explains why an attribute with values is made elsewhere, and refuses a field that skipped it', async () => {
    const harness = alterFormInSpanish();
    const dialog = await openFieldDialog(
      harness,
      'Crear nuevo campo de formulario',
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Atributo' }),
      '#create-new-attribute',
    );
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Tipo de respuesta' }),
      'categorical',
    );

    expect(
      await dialog.findByText(
        'Un atributo entre cuyas respuestas elige el participante necesita al menos dos valores, así que se crea junto con ellos.',
      ),
    ).toBeInTheDocument();
    expect(
      dialog.getByRole('button', { name: 'Crear este atributo y sus valores' }),
    ).toBeInTheDocument();

    await writeQuestion(harness, dialog, '¿Dónde soléis veros?');
    await harness.user.click(dialog.getByRole('button', { name: 'Añadir' }));

    expect(
      await dialog.findByText(
        'Crea este atributo y los valores que ofrece antes de añadir el campo que lo recoge.',
      ),
    ).toBeInTheDocument();
  });

  it('creates an attribute and its values from the field that collects it', async () => {
    const harness = alterFormInSpanish();
    const dialog = await openFieldDialog(
      harness,
      'Crear nuevo campo de formulario',
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Atributo' }),
      '#create-new-attribute',
    );
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Tipo de respuesta' }),
      'categorical',
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Crear este atributo y sus valores' }),
    );

    // The codebook's own editor, opened under the words on the button that
    // opened it.
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Nombre del atributo' }),
      'lugar_de_contacto',
    );
    await addValue(harness, 1, 'En casa', 'casa');
    await addValue(harness, 2, 'En el trabajo', 'trabajo');
    await harness.user.click(
      screen.getByRole('button', { name: 'Crear atributo' }),
    );

    // The attribute now exists, so the row offers the two things that belong
    // to it rather than the one that makes it.
    expect(
      await dialog.findByRole('button', {
        name: 'Cambiar los valores de este atributo',
      }),
    ).toBeInTheDocument();
    expect(
      dialog.getByRole('button', {
        name: 'Definir reglas para esta respuesta',
      }),
    ).toBeInTheDocument();
  });

  it('offers the answers of a yes-or-no field by their words', async () => {
    const harness = alterFormInSpanish();
    // The fixture's second field collects a boolean, whose two stored values
    // are fixed and whose WORDS are the researcher's.
    const dialog = await openFieldDialog(harness, 'Editar campo', 1);

    expect(screen.getByText('Editar campo de formulario')).toBeInTheDocument();
    expect(
      await dialog.findByRole('button', {
        name: 'Cambiar las etiquetas de respuesta de este atributo',
      }),
    ).toBeInTheDocument();
    expect(
      dialog.getByRole('button', {
        name: 'Definir reglas para esta respuesta',
      }),
    ).toBeInTheDocument();
  });

  it('offers what a date field accepts', async () => {
    const harness = alterFormInSpanish();
    seedPersonVariables(harness, {
      met_on: { name: 'met_on', type: 'datetime', component: 'DatePicker' },
    });
    const dialog = await openFieldDialog(
      harness,
      'Crear nuevo campo de formulario',
    );
    await chooseAttribute(harness, dialog, 'met_on');

    // A date is not chosen from a list, so what there is to set is the window
    // it accepts rather than any values.
    expect(
      await dialog.findByRole('button', {
        name: 'Definir qué acepta este campo',
      }),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole('button', {
        name: 'Cambiar los valores de este atributo',
      }),
    ).toBeNull();
  });

  /**
   * The dialog with no input control to offer. `layout` records where a node
   * was dropped rather than an answer, so no control collects it — a form
   * cannot ask for one, and a protocol that already does opens here.
   */
  it('says a field whose attribute cannot be answered is unsaveable', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'collects-a-position',
        type: 'AlterForm',
        fields: {
          ...loadFixtureStage('alter-form-1').fields,
          label: 'Dónde se sitúa cada persona',
          form: {
            fields: [{ variable: 'layout', prompt: '¿Dónde se sitúa?' }],
          },
        },
      },
      locale: 'es',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openFieldDialog(harness, 'Editar campo');

    expect(
      await dialog.findByText(
        'El atributo de este campo no ofrece al participante ninguna forma de responder. Elige otro atributo o elimina este campo.',
      ),
    ).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Guardar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

/**
 * The codebook writes a field makes, refused — in Spanish.
 *
 * A compound result's own `message` is written for whoever reads a log, and
 * the builder's throws name a record id nobody has seen. What lands on the
 * control is this package's own wording, and this is where it is read in the
 * language a researcher asked for.
 */
describe('a codebook write a Spanish form field needs, refused', () => {
  it('says what is wrong with a name the codebook cannot store', async () => {
    const harness = alterFormInSpanish();

    const dialog = await inventAttribute(harness, 'nombre de pila');

    expect(
      await dialog.findByText(
        'No es un nombre de atributo válido. Solo se admiten letras, números y los símbolos ._-:',
      ),
    ).toBeInTheDocument();
  });

  it('says another attribute of this type is already called that', async () => {
    const harness = alterFormInSpanish();

    // `age` is what the fixture's person type already calls one of its own.
    const dialog = await inventAttribute(harness, 'age');

    expect(
      await dialog.findByText(
        'Ya existe aquí un atributo con este nombre. Elige otro nombre.',
      ),
    ).toBeInTheDocument();
  });

  it('says the type it would be added to has gone', async () => {
    const harness = alterFormInSpanish();
    // The type this stage collects about, deleted by a collaborator. A
    // codebook section has a lock of its own, so holding this stage does not
    // hold that off.
    harness.receiveCodebookUpdate({ node: { person: null } });

    const dialog = await inventAttribute(harness, 'apodo');

    expect(
      await dialog.findByText(
        'Esta etapa trabaja con algo que el libro de códigos ya no contiene, así que no se ha guardado nada. Elige de nuevo con qué trabaja.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The refusal with no explanation of its own: the codebook will not rewrite
   * this attribute, and what is wrong with it is not something the researcher
   * chose here.
   *
   * Reached through an attribute the protocol SCHEMA accepts and the builder
   * refuses — a stored value with a space in it, which export formats turn
   * into a key — so the row's own save is refused on the control that caused
   * it rather than closing over a write that never happened.
   */
  it('says the input control could not be recorded', async () => {
    const harness = alterFormInSpanish();
    seedPersonVariables(harness, {
      lugar_de_contacto: {
        name: 'lugar_de_contacto',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'En casa', value: 'en casa' },
          { label: 'En el trabajo', value: 'trabajo' },
        ],
      },
    });
    const dialog = await openFieldDialog(
      harness,
      'Crear nuevo campo de formulario',
    );
    await chooseAttribute(harness, dialog, 'lugar_de_contacto');
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Control de entrada' }),
      'ToggleButtonGroup',
    );
    await writeQuestion(harness, dialog, '¿Dónde soléis veros?');
    await harness.user.click(dialog.getByRole('button', { name: 'Añadir' }));

    expect(
      await dialog.findByText(
        'No se ha podido cambiar el control de entrada de este atributo, así que no se ha cambiado nada. Inténtalo de nuevo.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The rules about the LIST, which no row can refuse: they are said above the
 * fields rather than on one of them, and only a save can ask them.
 */
describe('a form a Spanish researcher cannot save', () => {
  it('says a form with nothing left in it collects nothing', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      locale: 'es',
      sections: <FormFieldsSection subject="ego" />,
    });

    // Twice: the first click asks, and the confirmation carries the same words.
    await harness.user.click(
      screen.getByRole('button', { name: 'Eliminar campo' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Eliminar campo' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Editar campo' }),
      ).not.toBeInTheDocument(),
    );

    expect(
      screen.getByText(
        'Todavía no hay campos. Crea uno para indicar qué recoge este formulario.',
      ),
    ).toBeInTheDocument();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Añade al menos un campo. Un formulario sin campos no recoge nada.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * Both halves of the one-attribute-per-form rule, which the picker hides and
   * neither the list nor the row can let through: a protocol that arrives
   * already repeating one is refused above the list, and the row that repeats
   * it is refused on the control that names it.
   */
  it('says an attribute is collected twice, from the list and from the row', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'repite-un-atributo',
        type: 'AlterForm',
        fields: {
          label: 'Formulario de alter',
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [
              {
                variable: 'relationship_to_ego',
                prompt: '¿De qué os conocéis?',
              },
              { variable: 'relationship_to_ego', prompt: '¿Y de qué más?' },
            ],
          },
        },
      },
      locale: 'es',
      sections: <FormFieldsSection subject="node" />,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Dos campos recogen el mismo atributo. Cada atributo puede recogerse una sola vez por formulario.',
      ),
    ).toBeInTheDocument();

    const dialog = await openFieldDialog(harness, 'Editar campo', 1);
    await harness.user.click(dialog.getByRole('button', { name: 'Guardar' }));

    expect(
      await dialog.findByText(
        'Otro campo de este formulario ya recoge este atributo. Elige otro, o edita ese campo.',
      ),
    ).toBeInTheDocument();
  });

  it('says a field nobody finished has to be finished', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'un-campo-sin-terminar',
        type: 'AlterForm',
        fields: {
          label: 'Formulario de alter',
          subject: { entity: 'node', type: 'person' },
          // A field that names an attribute and asks nothing, which the row
          // dialog cannot produce and an import can.
          form: { fields: [{ variable: 'relationship_to_ego' }] },
        },
      },
      locale: 'es',
      sections: <FormFieldsSection subject="node" />,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Cada campo necesita un atributo y una pregunta. Abre el campo incompleto y termínalo.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for the heading the form is shown under', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      locale: 'es',
      sections: <FormFieldsSection subject="node" hasTitle />,
    });

    await harness.user.clear(
      await screen.findByRole('textbox', { name: 'Título del formulario' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText('Da un título a este formulario.'),
    ).toBeInTheDocument();
  });
});

/**
 * A form on a stage that has not been told what it is about yet.
 *
 * There is nothing to draw attributes from, so the section says what is
 * missing in place of its own description and closes.
 */
describe('a Spanish form-fields section waiting on a subject', () => {
  it('says what has to be chosen first', async () => {
    renderStageEditor({
      stage: {
        id: 'sin-sujeto',
        type: 'NameGenerator',
        fields: {
          label: 'Generador de nombres',
          form: { title: 'Añadir una persona', fields: [] },
          prompts: [{ id: 'prompt-1', text: '¿A quién conoces?' }],
        },
      },
      locale: 'es',
      sections: <FormFieldsSection subject="node" hasTitle />,
    });

    expect(
      await screen.findByText(
        'Elige con qué trabaja esta etapa antes de escribir su formulario.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear nuevo campo de formulario' }),
    ).toBeDisabled();
  });
});
