import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { stageMessages } from '../events';
import { networkExporterCatalogs } from '../locales/catalogs';
import { exportStageMessages } from '../messages';

describe('export stage presentation', () => {
  it('preserves the worker diagnostic English without requiring localization in the worker', () => {
    const intl = createAppIntl({ locale: 'en' });
    expect(Object.keys(exportStageMessages)).toEqual(
      Object.keys(stageMessages),
    );
    for (const [stage, descriptor] of Object.entries(exportStageMessages)) {
      expect(intl.formatMessage(descriptor)).toBe(
        stageMessages[stage as keyof typeof stageMessages],
      );
    }
  });

  it('formats the same stage identity in the current reader language', () => {
    const english = createAppIntl({ locale: 'en' });
    const spanish = createAppIntl({
      locale: 'es',
      messages: networkExporterCatalogs.es,
    });
    expect(english.formatMessage(exportStageMessages.generating)).toBe(
      'Generating files...',
    );
    expect(spanish.formatMessage(exportStageMessages.generating)).toBe(
      'Generando archivos…',
    );
    expect(stageMessages.generating).toBe('Generating files...');
  });
});
