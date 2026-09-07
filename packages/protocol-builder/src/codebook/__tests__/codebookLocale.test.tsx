import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import type { CompoundEditResult } from '../../session.ts';
import { esIntl, readMessage } from '../../testing/i18n.ts';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import CodebookEntityEditor from '../components/CodebookEntityEditor.tsx';
import CodebookSurface from '../components/CodebookSurface.tsx';
import VariableEditor from '../components/VariableEditor.tsx';
import CodebookVariableValidationEditor from '../validation/CodebookVariableValidationEditor.tsx';
import { ruleMapPrecheck } from '../variableValidation.ts';

/**
 * The codebook read in the researcher's own language, through both routes the
 * copy in this directory takes.
 *
 * `CodebookSurface` renders its own words with `useAppIntl()`. A validation
 * refusal takes the other route: it is produced with no formatter at all,
 * encoded with `createMessageError`, and only chooses its words where it is
 * rendered. The two have to agree, and the refusal is the harder case —
 * its sentence carries a REFERENCE to the rule's own name, so a half-converted
 * rule label would show a Spanish sentence with an English rule in the middle
 * of it.
 *
 * The rest of this directory's suite mounts no provider, so every component
 * renders its English `defaultMessage` and the existing English assertions
 * stand. This is the one test that mounts one.
 */
const context: ProtocolBuilderProtocolContext = {
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        icon: 'add-a-person',
        shape: { default: 'circle' },
        variables: {
          age: { name: 'Age', type: 'number', component: 'Number' },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          closeness: { name: 'Closeness', type: 'number' },
        },
      },
    },
    ego: {
      variables: {
        consent: { name: 'Consent', type: 'boolean' },
      },
    },
  },
  assets: {},
  orderedStages: [],
  issues: [],
};

/**
 * The catalog a host actually mounts, in the merge order `frescoUiCatalogs`
 * documents: common verbs, then the shared components, then this package.
 *
 * All three layers matter to a sweep. Passing only `protocolBuilderCatalogs.es`
 * leaves `commonMessages.cancel` and every `frescoUi.*` id falling back to
 * English, and the fallbacks are not harmless noise: fresco-ui's field marker
 * is "Required", which is also the English of this package's own
 * `variableValidation.requiredLabel`, so the sweep reported a protocol-builder
 * leak for a string protocol-builder never rendered. Mounting what a host
 * mounts is what makes the English left on screen this package's own.
 */
const SPANISH = mergeCatalogs(
  commonCatalogs.es ?? {},
  frescoUiCatalogs.es ?? {},
  protocolBuilderCatalogs.es ?? {},
);

const renderInSpanish = (children: ReactNode) =>
  render(
    <AppI18nProvider locale="es" locales={ecosystemLocales} messages={SPANISH}>
      {children}
    </AppI18nProvider>,
  );

const inSpanish = () => (
  <CodebookSurface
    context={context}
    onCreateEntity={() => undefined}
    onEditEntity={() => undefined}
    onCreateVariable={() => undefined}
    onEditVariable={() => undefined}
  />
);

describe('the codebook read in Spanish', () => {
  it('ships Spanish for the ids this directory declares', () => {
    // Checked first so a merge that has not landed this directory's catalog
    // entries fails saying so, rather than as an unexplained missing string.
    expect(Object.keys(protocolBuilderCatalogs.es ?? {})).toEqual(
      expect.arrayContaining([
        'protocolBuilder.codebookEntity.codebookTitle',
        'protocolBuilder.codebookEntity.subjectDescription',
        'protocolBuilder.codebookEntity.editAttributeLabel',
        'protocolBuilder.variableValidation.incompleteValueRule',
        'protocolBuilder.variableValidation.minValueLabel',
      ]),
    );
  });

  it('names the surface, its sections and its empty states in Spanish', () => {
    renderInSpanish(inSpanish());

    // Literals rather than `esIntl.formatMessage(...)` of the same descriptor:
    // re-formatting what the component formats would pass whatever the catalog
    // said, including nothing.
    expect(
      screen.getByRole('heading', { name: 'Libro de códigos', level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Revisa los tipos de entidad y los atributos que tiene cada uno.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Tipos de nodos', level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Tipos de vínculos', level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Crear tipo de vínculo' }),
    ).toBeVisible();
  });

  it('assembles a whole card name rather than splicing a translated noun', () => {
    renderInSpanish(inSpanish());

    // The entity, its codebook name and the verb are one message per case, so
    // Spanish is free to order them its own way. These fail if any of the four
    // goes back to a template with a noun dropped into it.
    expect(
      screen.getByRole('article', { name: 'Tipo de nodo: Person' }),
    ).toBeVisible();
    expect(
      screen.getByRole('article', { name: 'Atributos de Ego' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Editar tipo de vínculo: Knows' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Crear atributo para el tipo de nodo: Person',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Editar el atributo Consent de los atributos de Ego',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('list', { name: 'Atributos de Person' }),
    ).toHaveTextContent('Age');
  });

  it('reads a validation refusal, and the rule it names, in Spanish', () => {
    // `ruleMapPrecheck` takes no formatter: the refusal it returns is encoded,
    // and the rule's own name travels inside it as a second encoded message.
    // Decoding in Spanish is what resolves both.
    expect(
      readMessage(
        ruleMapPrecheck({ minValue: null, maxValue: 2 }).issue ?? '',
        esIntl,
      ),
    ).toBe('Introduce un valor para «Valor mínimo» o desactiva la regla.');
  });
});

/**
 * The editors, swept for English rather than sampled for Spanish.
 *
 * The tests above name the sentences they expect, which is what makes them
 * readable — and also what makes them blind: a literal nobody thought to
 * assert on stays English forever, and the assertions still pass. Two rounds
 * of review found exactly that, in text children and in option arrays that the
 * `no-literal-string-in-jsx` rule and the attribute scan both walk past.
 *
 * So this reads the other way round. It renders the editors in Spanish and
 * fails on ANY English the catalog has a Spanish word for, whether or not
 * anyone anticipated it — including the `<option>` text of the colour and
 * shape lists, which is where the last sweep found `Node color 1` and
 * `Circle`.
 *
 * Both editors are driven into their failure state as well, because the alert
 * they raise is copy a reader only sees when something has already gone wrong
 * and is the least likely to be looked at in review.
 */
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const PERSON_DOCUMENT: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables: {},
};

/** A refusal that names no holder, so the editor formats its own sentence. */
const blocked = (): CompoundEditResult => ({
  status: 'blocked',
  blockedSections: [{ sectionId: PERSON_SECTION }],
});

describe('the codebook editors swept for English', () => {
  it('leaves no English in the entity editor, its choice lists or its failure alert', async () => {
    const user = userEvent.setup();
    renderInSpanish(
      <CodebookEntityEditor
        mode="create"
        sessionKey="es-entity"
        createRequestId={() => 'request-es-entity'}
        description="crear tipo de nodo"
        subject={{ entity: 'node', type: 'person' }}
        initialDraft={PERSON_DOCUMENT}
        existingEntityNames={[]}
        onSubmit={blocked}
        onApplied={() => undefined}
        onCancel={() => undefined}
      />,
    );

    // Anchors: a sweep over an editor that failed to render passes vacuously,
    // so name one string per surface the sweep is supposed to be looking at.
    expect(
      screen.getByRole('heading', { name: 'Crear tipo de nodo', level: 2 }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Círculo' })).toBeInTheDocument();
    expectNoLocaleLeaks('the entity editor', protocolStrings(PERSON_DOCUMENT));

    await user.click(screen.getByRole('button', { name: 'Guardar entidad' }));

    expect(
      await screen.findByText('No se ha podido guardar esta entidad'),
    ).toBeVisible();
    expectNoLocaleLeaks(
      'the entity editor after a refused save',
      protocolStrings(PERSON_DOCUMENT),
    );
  });

  it('leaves no English in the attribute editor, its option rows or its failure alert', async () => {
    const user = userEvent.setup();
    const draft = {
      name: 'preferencia',
      type: 'categorical',
      options: [
        { label: 'Mucho', value: 'mucho' },
        { label: 'Poco', value: 'poco' },
      ],
    };
    renderInSpanish(
      <VariableEditor
        openId="es-variable"
        mode="create"
        subject={{ entity: 'node', type: 'person' }}
        authoritativeDocument={PERSON_DOCUMENT}
        variableId="new-variable"
        initialDraft={draft}
        protocolContext={context}
        description="crear atributo"
        createRequestId={() => 'request-es-variable'}
        onSubmitRequest={blocked}
        onComplete={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Añadir opción' })).toBeVisible();
    expectNoLocaleLeaks(
      'the attribute editor',
      protocolStrings(PERSON_DOCUMENT, draft),
    );

    await user.click(screen.getByRole('button', { name: 'Crear atributo' }));

    // The blocker itself is a section id, so the sentence around it is what
    // identifies the alert.
    expect(
      await screen.findByText(/Tu borrador se ha conservado\./),
    ).toBeVisible();
    expectNoLocaleLeaks(
      'the attribute editor after a refused save',
      protocolStrings(PERSON_DOCUMENT, draft),
    );
  });

  it('leaves no English in the validation editor or its rule list', async () => {
    const user = userEvent.setup();
    const variables: Readonly<Record<string, unknown>> = {
      age: {
        name: 'Age',
        type: 'number',
        component: 'Number',
        validation: { minValue: 0 },
      },
      height: { name: 'Height', type: 'number', component: 'Number' },
    };
    const document: SectionDoc = { ...PERSON_DOCUMENT, variables };
    renderInSpanish(
      <CodebookVariableValidationEditor
        openId="es-validation"
        subject={{ entity: 'node', type: 'person' }}
        variableId="age"
        authoritativeEntityDocument={document}
        allSubjectVariables={variables}
        requestMetadata={{
          createId: () => 'request-es-validation',
          description: 'actualizar la validación de Age',
        }}
        onSubmitRequest={blocked}
      />,
    );

    const minimum = screen.getByRole('spinbutton', { name: 'Valor mínimo' });
    expect(minimum).toBeVisible();
    expectNoLocaleLeaks('the validation editor', protocolStrings(document));

    // The submit stays disabled until the draft differs from the authority,
    // so the refusal is only reachable through an actual edit.
    await user.clear(minimum);
    await user.type(minimum, '3');
    await user.click(
      screen.getByRole('button', { name: 'Guardar validación' }),
    );

    expect(
      await screen.findByText(
        'Se está editando una sección necesaria para este cambio.',
      ),
    ).toBeVisible();
    expectNoLocaleLeaks(
      'the validation editor after a refused save',
      protocolStrings(document),
    );
  });
});
