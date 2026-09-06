import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { protocolValidationCatalogs } from '../../locales/catalogs.ts';
import {
  describeProtocolFileErrorMessage,
  formatValidationContradiction,
  formatValidationRule,
} from '../../messages.ts';
import {
  MigrationError,
  MigrationNotPossibleError,
  MigrationStepError,
  SchemaVersionDetectionError,
  ValidationError,
  VersionMismatchError,
} from '../../migration/errors.ts';
import { describeProtocolFileError } from '../describeProtocolFileError.ts';
import { NetcanvasInflationLimitError } from '../extractProtocol.ts';
import {
  MalformedNetcanvasError,
  type MalformedNetcanvasReason,
} from '../malformedNetcanvasError.ts';

const en = createAppIntl({ locale: 'en' });
const es = createAppIntl({
  locale: 'es',
  messages: protocolValidationCatalogs.es,
});
const malformedReasons: MalformedNetcanvasReason[] = [
  'not-an-archive',
  'missing-protocol',
  'unreadable-protocol-json',
  'missing-asset',
  'invalid-asset-definition',
];
const errors = [
  ...malformedReasons.map(
    (reason) =>
      new MalformedNetcanvasError(reason, 'technical error', {
        assetName: 'Village map',
      }),
  ),
  new MalformedNetcanvasError('missing-asset', 'technical error'),
  new MigrationNotPossibleError(5, 8),
  new VersionMismatchError(8, 5),
  new MigrationStepError(6),
  new SchemaVersionDetectionError(),
  new ValidationError('name: Required', 8),
  new MigrationError('technical error'),
];

describe('localized protocol failure guidance', () => {
  it.each(errors)(
    'preserves legacy English and translates $name without changing its diagnostic',
    (error) => {
      const original = error.message;
      const message = describeProtocolFileErrorMessage(error);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Expected a classified error');
      expect(en.formatMessage(message.descriptor, message.values)).toBe(
        describeProtocolFileError(error),
      );
      expect(es.formatMessage(message.descriptor, message.values)).not.toBe(
        describeProtocolFileError(error),
      );
      expect(error.message).toBe(original);
    },
  );

  it('retains a missing asset name as researcher data in a complete Spanish sentence', () => {
    const message = describeProtocolFileErrorMessage(
      new MalformedNetcanvasError('missing-asset', 'technical error', {
        assetName: 'Village map',
      }),
    );
    if (!message) throw new Error('Expected a missing-asset explanation');
    expect(es.formatMessage(message.descriptor, message.values)).toBe(
      'Este protocolo hace referencia a un archivo que no está incluido: «Village map».',
    );
  });

  it('translates the inflation refusal and declines unrelated failures', () => {
    const message = describeProtocolFileErrorMessage(
      new NetcanvasInflationLimitError('technical limit'),
    );
    if (!message) throw new Error('Expected an inflation explanation');
    expect(es.formatMessage(message.descriptor, message.values)).toContain(
      'Al descomprimir este protocolo',
    );
    expect(
      describeProtocolFileErrorMessage(new Error('storage quota')),
    ).toBeNull();
    expect(describeProtocolFileErrorMessage(null)).toBeNull();
  });

  it('formats contradiction subjects as a locale-aware list without translating research data', () => {
    const contradiction = {
      class: 'conflictingReferencePair',
      message: 'English diagnostic',
      variableIds: ['a', 'b'],
      strips: [{ variableId: 'a', rule: 'sameAs' }],
    } as const;
    const formatted = formatValidationContradiction(
      {
        ...contradiction,
        variableIds: [...contradiction.variableIds],
        strips: [{ variableId: 'a', rule: 'sameAs' }],
      },
      es,
      ['Friends', 'Family'],
    );
    expect(formatted).toBe(
      'Las reglas exigen que Friends y Family sean a la vez iguales y diferentes. Elimina una de estas reglas incompatibles.',
    );
    expect(formatValidationRule('minSelected', es)).toBe('Selección mínima');
    expect(formatValidationRule('extensionRule', es)).toBe('extensionRule');
  });
});
