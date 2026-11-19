import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { VARIABLE_TYPES, getVariableTypeLabel } from '~/config/variables';
import { architectCatalogSource } from '~/locales/catalogs';
import {
  assertCompressedSizeWithinLimit,
  MAX_COMPRESSED_BYTES,
  NetcanvasTooLargeError,
} from '~/utils/netcanvasSizeGuard';
import {
  describeImportFailure,
  PROTOCOL_OPEN_FAILURE_MESSAGE,
} from '~/utils/protocolImportErrors';

const spanish = createAppIntl({
  locale: 'es',
  messages: await architectCatalogSource.load('es'),
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('translates attribute type labels while preserving stable type identifiers', () => {
  expect(getVariableTypeLabel('datetime', spanish)).toBe('Fecha');
  expect(getVariableTypeLabel('Unrecognized_Research_Type', spanish)).toBe(
    'Unrecognized_Research_Type',
  );
  expect(VARIABLE_TYPES.datetime.value).toBe('datetime');
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
