import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import {
  SyntheticDataConstraintError,
  type ConstraintConflict,
} from '@codaco/protocol-utilities';
import { interviewerProductionLocales } from '~/i18n/locales';
import { interviewerCatalogs } from '~/locales/catalogs';

import { GenerationFailureDescription } from '../GenerationFailureDescription';

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders same-id conflicts from different subjects without duplicate React keys', () => {
  const conflicts: ConstraintConflict[] = [
    {
      entity: 'node',
      entityType: 'person',
      entityTypeName: 'Person',
      variableIds: ['name'],
      variableNames: ['Name'],
      rules: ['required'],
      reason: 'first conflict',
    },
    {
      entity: 'node',
      entityType: 'place',
      entityTypeName: 'Place',
      variableIds: ['name'],
      variableNames: ['Name'],
      rules: ['unique'],
      reason: 'second conflict',
    },
  ];
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  render(
    <GenerationFailureDescription
      error={new SyntheticDataConstraintError(conflicts)}
    />,
  );

  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(
    consoleError.mock.calls.some((call) =>
      call.some(
        (argument) =>
          typeof argument === 'string' &&
          argument.includes('Encountered two children with the same key'),
      ),
    ),
  ).toBe(false);
});

it('keeps authored names while translating the actionable conflict and validation rules', () => {
  const error = new SyntheticDataConstraintError([
    {
      entity: 'node',
      entityType: 'person',
      entityTypeName: 'Personas Á',
      variableIds: ['band'],
      variableNames: ['Grupo original'],
      rules: ['unique'],
      reasonCode: 'insufficientUniqueValues',
      reason:
        'Legacy English diagnostic that must not become primary repair guidance',
    },
  ]);
  const view = render(
    <AppI18nProvider locale="en" locales={interviewerProductionLocales}>
      <GenerationFailureDescription error={error} />
    </AppI18nProvider>,
  );
  expect(screen.getByRole('listitem')).toHaveTextContent(
    'Too few distinct values are available',
  );
  view.rerender(
    <AppI18nProvider
      locale="es"
      locales={interviewerProductionLocales}
      messages={interviewerCatalogs.es}
    >
      <GenerationFailureDescription error={error} />
    </AppI18nProvider>,
  );
  expect(screen.getByRole('listitem')).toHaveTextContent('Personas Á');
  expect(screen.getByRole('listitem')).toHaveTextContent('Grupo original');
  expect(screen.getByRole('listitem')).toHaveTextContent(
    'No hay suficientes valores distintos',
  );
  expect(screen.getByRole('listitem')).not.toHaveTextContent(
    'Legacy English diagnostic',
  );
  expect(
    screen.getByText(/ajusta el protocolo en Architect/),
  ).toBeInTheDocument();
});
