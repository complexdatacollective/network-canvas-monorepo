import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../controller.ts';
import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  type ProtocolBuilderSession,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
} from '../../session.ts';
import { esIntl, readMessage } from '../../testing/i18n.ts';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import { DEFAULT_ITEM_LABEL } from '../arrayFields/arrayMessages.ts';
import { readOnlyMessage } from '../arrayFields/arrayWriteRefusal.ts';
import Options, { optionsValidation } from '../arrayFields/Options.tsx';
import ProtocolArrayField from '../ProtocolArrayField.tsx';
import StageEditorShell from '../StageEditorShell.tsx';

/**
 * An options list and the shell around it, read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every component
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. This is the one test that mounts one, and it covers all
 * three routes the copy in `src/form` takes:
 *
 * - the shell's own markup, which formats with `useAppIntl()` (the outline's
 *   landmark);
 * - a list's markup, which does the same and also splices the researcher's own
 *   row number into it (`Editar opción 1`);
 * - a refusal, which is encoded where it is decided and decoded where it is
 *   read — the only route where an English word could survive a translated
 *   sentence, because the row noun travels inside it as a nested reference.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
const optionsFields: SectionDoc = {
  label: 'Detalles',
  options: [
    { label: 'Sí', value: 'si' },
    { label: 'No', value: 'no' },
  ],
};

const createSession = (fields: SectionDoc = optionsFields) =>
  new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Edición localizada',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });

/**
 * A session whose next write is refused while its snapshot still says the
 * stage is editable — the lease taken back between the render a handler was
 * built in and the click that dispatches. `setAccess` cannot stand in for it:
 * it re-renders, and every control of a read-only list is withdrawn, so there
 * is nothing left to click.
 */
const withRevocableDispatch = (
  store: ProtocolBuilderSessionStore,
): ProtocolBuilderSession => ({
  subscribe: (listener) => store.subscribe(listener),
  getSnapshot: () => store.getSnapshot(),
  getServerSnapshot: () => store.getServerSnapshot(),
  dispatch: () => {
    throw new SessionReadOnlyError();
  },
  undo: () => store.undo(),
  redo: () => store.redo(),
  validate: () => store.validate(),
  requestCompoundEdit: (request) => store.requestCompoundEdit(request),
  finish: () => store.finish(),
  cancel: () => store.cancel(),
  getResourceGateway: () => store.getResourceGateway(),
});

function Editor({ session }: { session: ProtocolBuilderSession }) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Terminar</SubmitButton>
      )}
    >
      <BuilderSection title="Opciones de respuesta">
        <ProtocolArrayField
          name="options"
          label="Opciones de respuesta"
          component={Options}
          addButtonLabel="Crear una opción nueva"
          {...optionsValidation}
        />
      </BuilderSection>
    </StageEditorShell>
  );
}

/**
 * The catalog a real host serves: common verbs, then Fresco's own chrome, then
 * this package's copy — the merge order every host uses. Assembled here rather
 * than passing this package's catalog alone, because these lists hand words to
 * Fresco controls and take their confirmation's cancel verb from `common.*`,
 * and a merge that dropped either layer is exactly the wiring this checks.
 */
const hostCatalog = mergeCatalogs(
  commonCatalogs.es ?? {},
  frescoUiCatalogs.es ?? {},
  protocolBuilderCatalogs.es ?? {},
);

/**
 * Everything on screen that is the researcher's rather than this package's:
 * the option list the session is seeded with, read out of the same document
 * the harness mounts so a fixture that gains a row cannot quietly widen the
 * sweep's blind spot — or start failing it.
 */
const researcherWords = (fields: SectionDoc = optionsFields) =>
  protocolStrings(fields);

const renderInSpanish = (session: ProtocolBuilderSession) =>
  render(
    <AppI18nProvider
      locale="es"
      locales={ecosystemLocales}
      messages={hostCatalog}
    >
      <DialogProvider>
        <Editor session={session} />
      </DialogProvider>
    </AppI18nProvider>,
  );

describe('a stage form read in Spanish', () => {
  it('ships Spanish for the ids this directory declares', () => {
    // Checked first so a merge that has not landed this directory's catalog
    // entries fails saying so, rather than as an unexplained English string.
    expect(Object.keys(protocolBuilderCatalogs.es ?? {})).toEqual(
      expect.arrayContaining([
        'protocolBuilder.outline.landmarkLabel',
        'protocolBuilder.option.editOption',
        'protocolBuilder.option.emptyState',
        'protocolBuilder.arrayField.itemNoun',
        'protocolBuilder.arrayField.readOnlyRefusal',
      ]),
    );
  });

  it('names the shell and the rows of a list in Spanish', async () => {
    renderInSpanish(createSession());

    expect(
      await screen.findByRole('navigation', { name: 'Secciones de la etapa' }),
    ).toBeInTheDocument();
    // The row's own number is spliced into the row's name, so this also fails
    // if the position stops reaching the message.
    expect(
      screen.getByRole('button', { name: 'Editar opción 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar opción 2' }),
    ).toBeInTheDocument();
    // The assertions above name what this surface is supposed to say; the sweep
    // reports whatever else it said — including a sentence rebuilt out of an
    // English pattern, which matches no whole message and so is invisible to
    // every assertion written as a literal.
    expectNoLocaleLeaks('the shell around a list', researcherWords());
  });

  it('says a list is empty in Spanish', async () => {
    renderInSpanish(createSession({ label: 'Detalles' }));

    expect(
      await screen.findByText('Todavía no se han añadido opciones.'),
    ).toBeInTheDocument();
    expectNoLocaleLeaks(
      'an empty list',
      researcherWords({ label: 'Detalles' }),
    );
  });

  it('reads a refused write back in Spanish, row noun and all', async () => {
    const user = userEvent.setup();
    renderInSpanish(withRevocableDispatch(createSession()));

    await user.click(
      await screen.findByRole('button', { name: 'Crear una opción nueva' }),
    );

    // The whole sentence, decoded by `FormErrors` under the provider. The noun
    // inside it travelled as its own descriptor, so an English `item` in the
    // parenthetical would mean the nested reference never resolved.
    expect(
      await screen.findByText(
        'Esta etapa es de solo lectura, así que esta entrada (elemento) no se ha guardado. Toma el control de la edición e inténtalo de nuevo.',
      ),
    ).toBeInTheDocument();
    expectNoLocaleLeaks('a refused write', researcherWords());
  });

  it('reads the same refusal back through the decode a caller uses', () => {
    // The encoding half on its own: what a host reading this package's
    // refusals out of a result — rather than rendering them — gets back.
    expect(readMessage(readOnlyMessage(DEFAULT_ITEM_LABEL), esIntl)).toBe(
      'Esta etapa es de solo lectura, así que esta entrada (elemento) no se ha guardado. Toma el control de la edición e inténtalo de nuevo.',
    );
  });
});
