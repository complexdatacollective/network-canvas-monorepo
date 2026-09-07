import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import type { Codebook } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import FormFieldsSection from '../FormFieldsSection.tsx';
import InterviewerGuidanceSection from '../InterviewerGuidanceSection.tsx';
import IntroductionSection from '../IntroductionSection.tsx';
import NetworkFilterSection from '../NetworkFilterSection.tsx';
import PageContentSection from '../PageContentSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import SkipLogicSection from '../SkipLogicSection.tsx';
import StageNameSection from '../StageNameSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
import {
  TestItemEditor,
  TestItemPreview,
  TestPromptEditor,
  TestPromptPreview,
} from './rowFixtures.tsx';

/**
 * The three sections every stage editor composes, read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so each section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. This is the one test that mounts one, and it is what proves
 * the wiring: a section still holding an English literal, or one whose ids
 * never reached `src/locales/es.json`, shows up here as an English string
 * where a Spanish one was asked for.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the section read. `intl.formatMessage(messages.title)` would pass
 * whatever the catalog said, including nothing at all.
 */
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const personVariables = {
  age: { name: 'Age', type: 'number', component: 'Number' },
} as const;

const protocolSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Localised editing', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [personSection]: {
    name: 'Person',
    color: 'node-color-seq-2',
    shape: { default: 'square' },
    variables: personVariables,
  },
};

const codebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: personVariables,
    },
  },
};

const alterFormFields: SectionDoc = {
  label: 'Detalles',
  subject: { entity: 'node', type: 'person' },
  form: { fields: [{ variable: 'age', prompt: '¿Qué edad tiene?' }] },
  introductionPanel: { title: 'Sobre la persona', text: 'Unas preguntas.' },
};

const createSession = () =>
  new ProtocolBuilderSessionStore({
    identity: createStageIdentity('AlterForm', () => 'stage-1'),
    fields: alterFormFields,
    protocolSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Localised editing',
      schemaVersion: 8,
      codebook,
      stages: [stageDocument],
    }),
  });

function Editor({ session }: { session: ProtocolBuilderSessionStore }) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Terminar</SubmitButton>
      )}
    >
      <NetworkFilterSection subject="node" />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}

/**
 * The catalog a real host serves: common verbs, then Fresco's own chrome, then
 * this package's copy — the merge order every host uses. Assembled here rather
 * than passing this package's catalog alone, because a section hands words to
 * Fresco controls and takes its confirmation's cancel verb from `common.*`,
 * and a merge that dropped either layer is exactly the kind of wiring this
 * test exists to catch.
 */
const hostCatalog = mergeCatalogs(
  commonCatalogs.es ?? {},
  frescoUiCatalogs.es ?? {},
  protocolBuilderCatalogs.es ?? {},
);

/**
 * Everything on screen that belongs to the researcher rather than to this
 * package: the protocol's own sections, the stage's fields, and the codebook
 * the sections read type and attribute names out of.
 *
 * Read out of the same documents the harness mounts, so a fixture that gains an
 * attribute cannot quietly widen the sweep's blind spot — or start failing it.
 */
const researcherWords = () =>
  protocolStrings(protocolSections, alterFormFields, codebook);

const renderInSpanish = () =>
  render(
    <AppI18nProvider
      locale="es"
      locales={ecosystemLocales}
      messages={hostCatalog}
    >
      <DialogProvider>
        <Editor session={createSession()} />
      </DialogProvider>
    </AppI18nProvider>,
  );

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
    renderInSpanish();

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
    expectNoLocaleLeaks('the closed sections', researcherWords());
  });

  it('labels the controls inside a section in Spanish', async () => {
    const user = userEvent.setup();
    renderInSpanish();

    await user.click(screen.getByRole('switch', { name: 'Lógica de salto' }));

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
    expectNoLocaleLeaks('the open skip-logic section', researcherWords());
  });

  it('asks in Spanish before throwing a capability’s content away', async () => {
    const user = userEvent.setup();
    renderInSpanish();

    const guidance = screen.getByRole('switch', {
      name: 'Guía para quien realiza la entrevista',
    });
    await user.click(guidance);
    const field = await screen.findByRole('textbox', {
      name: 'Texto del guion de la entrevista',
    });
    await user.click(field);
    await user.keyboard('Pregunta con calma.');
    await user.click(guidance);

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
    expectNoLocaleLeaks('the discard confirmation', researcherWords());
  });
});

/**
 * The shared sections read in Spanish.
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
describe('the shared sections, read in Spanish', () => {
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
      screen.getByRole('button', { name: 'Crear nuevo bloque de contenido' }),
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

    expect(
      screen.getByRole('textbox', { name: 'Encabezado de la introducción' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Presenta esta tarea al participante antes de que la empiece.',
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
      screen.getByText(
        'Todos los nodos que esta etapa cree o muestre serán del tipo que elijas aquí.',
      ),
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
});
