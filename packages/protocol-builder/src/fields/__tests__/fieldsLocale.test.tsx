import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales, loadCatalog } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import StageEditorShell from '../../form/StageEditorShell.tsx';
import { protocolBuilderCatalogLoaders } from '../../locales/catalogs.ts';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../../resources/client.tsx';
import { StageEditSession } from '../../stageEdit.tsx';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import {
  HARNESS_PRINCIPAL,
  SeedProtocolCache,
} from '../../testing/seedProtocolCache.tsx';
import { testTypeId, testVariableId } from '../../testing/testId.ts';
import EntityTypePickerField from '../EntityTypePickerField.tsx';
import StageDestinationPickerField from '../StageDestinationPickerField.tsx';
import VariablePickerField from '../VariablePickerField.tsx';

const PERSON = testTypeId('person');
const GHOST = testTypeId('ghost');
const AGE = testVariableId('age');
const GONE = testVariableId('gone');

/**
 * The three controls in this directory, read in the researcher's own language.
 *
 * `EntityTypePickerField` and `StageDestinationPickerField` render their own words
 * with `useAppIntl()`; the destination control is handed everything it shows by
 * `stageDestination.ts`, which is pure and takes the formatter as an
 * argument. Both have to agree, so this mounts the control rather than calling
 * the producer: a translated select beside an English option list is exactly
 * the drift this checks for.
 *
 * The rest of this directory's suite mounts no provider, so every control
 * renders its English `defaultMessage` and the existing English assertions
 * stand. This is the one test that mounts one.
 */

const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const personSection = sectionId({ kind: 'codebookNode', typeId: PERSON });
const STAGE_SECTION = sectionId({ kind: 'stage', stageId: 'stage-1' });

/** Copy in the protocol's only language, as schema 9 holds it. */
const en = (text: string) => ({ en: text });

/** The stage under edit, as its own section holds it. */
const stageFields: SectionDoc = {
  label: en('Welcome'),
  title: en('Hello'),
  items: [],
};

const informationStage = (id: string, label: string): SectionDoc => ({
  id,
  type: 'Information',
  label: en(label),
  title: en(label),
  items: [],
});

const personDefinition: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-2',
  shape: { default: 'square' },
  variables: {},
};

/**
 * Three stages, so the destination control offers two later ones to name and
 * has somewhere to put a destination the interview has lost.
 *
 * Every one of them is named: the protocol schema requires a stage label, so
 * the option that stands in for an unnamed stage cannot be reached through a
 * real protocol context. That branch is exercised in English against the pure
 * option builder, in `stageDestination.test.ts`.
 */
const baseSections: Record<string, SectionDoc> = {
  [settingsSection]: {
    name: 'Field localization',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
  },
  [stageOrderSection]: { stages: ['stage-1', 'stage-2', 'stage-3'] },
  [STAGE_SECTION]: { id: 'stage-1', type: 'Information', ...stageFields },
  [sectionId({ kind: 'stage', stageId: 'stage-2' })]: informationStage(
    'stage-2',
    'Middle',
  ),
  [sectionId({ kind: 'stage', stageId: 'stage-3' })]: informationStage(
    'stage-3',
    'Goodbye',
  ),
  [personSection]: personDefinition,
};

/**
 * Everything on screen that is the researcher's rather than this package's.
 *
 * Handed to the sweep so a stage a researcher called "Welcome" is not reported
 * as an untranslated string. Read out of the same documents the harness mounts,
 * so widening a fixture cannot quietly widen the sweep's blind spot; `extra`
 * carries the values a test passes as props rather than through the protocol —
 * a dangling type id, an option list, a chosen value.
 */
const researcherWords = (...extra: readonly unknown[]) =>
  protocolStrings(baseSections, stageFields, ...extra);

/**
 * The editor these controls live in, over the protocol above served from
 * memory — the same host the shared harness mounts, seeded here so the whole
 * surface is on screen synchronously.
 */
function Harness({
  sections,
  children,
}: {
  sections: Record<string, SectionDoc>;
  children: ReactNode;
}) {
  const [host] = useState(() =>
    createInMemoryHost({ sections, principal: HARNESS_PRINCIPAL }),
  );

  return (
    <ProtocolBuilder adapter={host.adapter} protocolId={host.protocolId}>
      <SeedProtocolCache store={host.store}>
        <ResourceClientProvider>
          <StageEditSession
            target={{ sectionId: STAGE_SECTION }}
            formId="stage-form"
          >
            <StageEditorShell>{children}</StageEditorShell>
          </StageEditSession>
        </ResourceClientProvider>
      </SeedProtocolCache>
    </ProtocolBuilder>
  );
}

const spanishMessages = await loadCatalog('es', protocolBuilderCatalogLoaders);

/** A control that reads the editor's protocol context, in Spanish. */
const inEditor = (children: ReactNode, sections = baseSections) => (
  <AppI18nProvider
    locale="es"
    locales={ecosystemLocales}
    messages={spanishMessages}
  >
    <DialogProvider>
      <Harness sections={sections}>{children}</Harness>
    </DialogProvider>
  </AppI18nProvider>
);

/** A control that reads nothing but its own props, in Spanish. */
const standalone = (children: ReactNode) => (
  <AppI18nProvider
    locale="es"
    locales={ecosystemLocales}
    messages={spanishMessages}
  >
    {children}
  </AppI18nProvider>
);

/** The one select on screen, read as the researcher sees it. */
const optionText = () =>
  [...screen.getByRole('combobox').querySelectorAll('option')].map(
    (option) => option.textContent,
  );

describe('the fields in this directory, read in Spanish', () => {
  it('names the entity chips and says what is missing in Spanish', () => {
    // Literals rather than the same descriptors re-formatted: asserting
    // `esIntl.formatMessage(...)` here would pass whatever the catalog said,
    // including nothing.
    render(inEditor(<EntityTypePickerField entityType="node" value={GHOST} />));

    expect(
      screen.getByRole('radiogroup', { name: 'Node type options' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: `${GHOST}: este tipo ya no está en el libro de códigos`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Este tipo ya no está en el libro de códigos. Elige otro.',
      ),
    ).toBeInTheDocument();
    // The assertions above name what this surface is supposed to say; the sweep
    // is what reports whatever else it said, including a sentence rebuilt out
    // of an English pattern that matches no whole message.
    expectNoLocaleLeaks('the entity select', researcherWords(GHOST));
  });

  it('says a protocol has no types yet in Spanish', () => {
    const { [personSection]: _person, ...withoutTypes } = baseSections;

    render(inEditor(<EntityTypePickerField entityType="node" />, withoutTypes));

    expect(
      screen.getByText('Todavía no hay tipos de nodo definidos'),
    ).toBeInTheDocument();
  });

  it('reads the attribute picker in Spanish', async () => {
    const user = userEvent.setup();

    render(
      standalone(
        <VariablePickerField
          name="attribute"
          options={[{ value: AGE, label: 'Age', type: 'number' }]}
          value={GONE}
        />,
      ),
    );

    // The stored choice nothing offers is kept and named on the field itself,
    // beside the sentence saying what the researcher has to do about it.
    expect(
      screen.getByText(`${GONE}: este atributo no está disponible aquí`),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Este atributo no está disponible aquí. Elige otro.'),
    ).toBeInTheDocument();
    // A real attribute is still there to be chosen while a dangling choice is
    // showing. It is chosen in the window the trigger opens: this picker has
    // no label of its own, so the window falls back to its own name.
    await user.click(screen.getByRole('combobox'));
    const dialog = await screen.findByRole('dialog', { name: 'Attributes' });
    // Named for what this window can do and no more: nothing was handed to it
    // to create with, so it only finds.
    expect(
      within(dialog).getByRole('combobox', { name: 'Find an attribute' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', { name: 'Age' }),
    ).toBeInTheDocument();
    expectNoLocaleLeaks(
      'the attribute picker',
      researcherWords([{ value: AGE, label: 'Age', type: 'number' }], GONE),
    );
  });

  it('names the chosen attribute’s type in Spanish', () => {
    render(
      standalone(
        <VariablePickerField
          name="attribute"
          options={[{ value: AGE, label: 'Age', type: 'number' }]}
          value={AGE}
        />,
      ),
    );

    // Stated beside the pill for anyone who cannot read its colour. Text
    // only a screen reader reads stays English in every language.
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(
      'Attribute type: Number',
    );
  });

  it('says there is nothing to choose from in Spanish', () => {
    render(standalone(<VariablePickerField name="attribute" />));

    expect(
      screen.getByText('No hay atributos entre los que elegir.'),
    ).toBeInTheDocument();
  });

  it('offers the skip destinations in Spanish', () => {
    render(
      inEditor(<StageDestinationPickerField name="skipLogic.destination" />),
    );

    expect(optionText()).toEqual([
      'Siguiente etapa disponible',
      // Only the words around the stage are translated: its own name is the
      // researcher's and stays exactly as they wrote it.
      'Etapa 2 — Middle',
      'Etapa 3 — Goodbye',
      'Finalizar la entrevista',
    ]);
    expectNoLocaleLeaks('the skip destination select', researcherWords());
  });

  it('reports a destination the interview has lost in Spanish', () => {
    render(
      inEditor(
        <StageDestinationPickerField
          name="skipLogic.destination"
          value={{ type: 'stage', stageId: 'deleted' }}
        />,
      ),
    );

    expect(
      screen.getByText(
        'La etapa de destino del salto ya no forma parte de esta entrevista. Elige dónde debe continuar la entrevista.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'Una etapa que ya no forma parte de esta entrevista',
      }),
    ).toBeInTheDocument();
    expectNoLocaleLeaks(
      'the skip destination select with a lost stage',
      researcherWords('deleted'),
    );
  });
});
