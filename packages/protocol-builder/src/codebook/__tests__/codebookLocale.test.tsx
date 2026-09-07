import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import { esIntl, readMessage } from '../../testing/i18n.ts';
import CodebookSurface from '../components/CodebookSurface.tsx';
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

const inSpanish = () => (
  <AppI18nProvider
    locale="es"
    locales={ecosystemLocales}
    messages={protocolBuilderCatalogs.es}
  >
    <CodebookSurface
      context={context}
      onCreateEntity={() => undefined}
      onEditEntity={() => undefined}
      onCreateVariable={() => undefined}
      onEditVariable={() => undefined}
    />
  </AppI18nProvider>
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
    render(inSpanish());

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
    render(inSpanish());

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
