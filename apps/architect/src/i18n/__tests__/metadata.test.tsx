import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import AttributeControlDescription from '~/components/Form/AttributeControlDescription';
import { VARIABLE_TYPES, getVariableTypeLabel } from '~/config/variables';
import { architectCatalogs } from '~/locales/catalogs';
import {
  assertCompressedSizeWithinLimit,
  MAX_COMPRESSED_BYTES,
  NetcanvasTooLargeError,
} from '~/utils/netcanvasSizeGuard';
import {
  describeImportFailure,
  PROTOCOL_OPEN_FAILURE_MESSAGE,
} from '~/utils/protocolImportErrors';
import { createValidations } from '~/utils/validations';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

const spanish = createAppIntl({ locale: 'es', messages: architectCatalogs.es });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('updates whole attribute badges while preserving stable type and control identifiers', () => {
  const data = { type: 'datetime', component: 'DatePicker' };
  const before = JSON.stringify(data);
  const { container } = render(
    <ArchitectI18nProvider>
      <AttributeControlDescription {...data} />
    </ArchitectI18nProvider>,
  );
  expect(container).toHaveTextContent(
    'Date attribute using DatePicker input control',
  );
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(container).toHaveTextContent(
    'Atributo de tipo Fecha con control Selector de fecha',
  );
  expect(screen.getByText('Fecha').tagName).toBe('STRONG');
  expect(screen.getByText('Selector de fecha').tagName).toBe('STRONG');
  expect(getVariableTypeLabel('datetime', spanish)).toBe('Fecha');
  expect(getVariableTypeLabel('Unrecognized_Research_Type', spanish)).toBe(
    'Unrecognized_Research_Type',
  );
  expect(VARIABLE_TYPES.datetime.value).toBe('datetime');
  expect(JSON.stringify(data)).toBe(before);
});

it('allows equality at a maximum and explains singular limits precisely in Spanish', () => {
  const rules = createValidations(spanish);
  const maximum = rules.maxValue(5, undefined);
  expect(maximum(5)).toBeUndefined();
  expect(maximum(6)).toBe('Debe ser como máximo 5');
  expect(rules.maxLength(1, undefined)('ab')).toBe(
    'Debe tener 1 carácter o menos',
  );
  expect(rules.minLength(2, undefined)('a')).toBe(
    'Debe tener 2 caracteres o más',
  );
  expect(rules.maxSelected(1, undefined)(['a', 'b'])).toBe(
    'Debes elegir un máximo de 1 opción',
  );
  expect(rules.minSelected(1, undefined)([])).toBe(
    'Debes elegir un mínimo de 1 opción',
  );
});

it('preserves the byte boundary and provides complete localized oversized-file guidance', () => {
  expect(() =>
    assertCompressedSizeWithinLimit(MAX_COMPRESSED_BYTES),
  ).not.toThrow();
  let failure: unknown;
  try {
    assertCompressedSizeWithinLimit(MAX_COMPRESSED_BYTES + 1024 * 1024);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(NetcanvasTooLargeError);
  const described = describeImportFailure(
    failure,
    PROTOCOL_OPEN_FAILURE_MESSAGE,
    spanish,
  );
  expect(described.message).toBe(
    'Este archivo de protocolo es demasiado grande para abrirlo (501 MB). El tamaño máximo admitido es de 500 MB.',
  );
  expect(described.localizedMessage).toBeDefined();
  expect(described.detail).toBe(
    'This protocol file is too large to open (501 MB). The maximum supported size is 500 MB.',
  );
});
