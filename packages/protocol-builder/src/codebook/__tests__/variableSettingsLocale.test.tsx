import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { esIntl } from '../../testing/i18n.ts';
import { compoundFailureMessage } from '../compoundFailureCopy.ts';
import { validateBooleanAnswers } from '../variableOptions.ts';
import { validateParameters } from '../variableParameters.ts';

/**
 * The three producers under `codebook/` that answer with words but render
 * none, read in Spanish.
 *
 * Each of them takes the reader's own formatter as a parameter rather than
 * reaching for one, which is the rule for copy that leaves React: a
 * module-level English formatter here would make the refusals a researcher
 * meets most often the only ones that never translate. These prove the
 * parameter is actually used — a producer that ignored it and returned its
 * `defaultMessage` would pass every English assertion in this directory and
 * fail here.
 */
describe('codebook copy produced outside React, read in Spanish', () => {
  it('refuses an unnamed boolean answer in the reader’s language', () => {
    expect(
      validateBooleanAnswers(
        [
          { label: 'Sí', value: true },
          { label: '', value: false },
        ],
        esIntl,
      ),
    ).toEqual({
      1: [
        'Escribe lo que dice esta respuesta, o borra ambas para ofrecer Sí y No.',
      ],
    });
  });

  it('refuses a scale with no end labels in the reader’s language', () => {
    expect(validateParameters('scalar', {}, esIntl)).toEqual({
      minLabel: ['Escribe qué significa el extremo bajo de la escala.'],
      maxLabel: ['Escribe qué significa el extremo alto de la escala.'],
    });
  });

  it('says why a codebook save was refused in the reader’s language', () => {
    expect(
      compoundFailureMessage(
        {
          kind: 'result',
          result: {
            status: 'failed',
            reason: 'lease-lost',
            // The host's own account of it, which no researcher is shown: the
            // whole point of this record is that they read the package's
            // sentence instead.
            message: 'lease revoked',
          },
        },
        esIntl,
      ),
    ).toBe(
      'Ya no eres quien edita esta etapa, así que no se ha guardado nada. Toma el control de la edición e inténtalo de nuevo.',
    );
  });

  it('names the collaborator holding a section it needs', () => {
    const blockedSection = sectionId({
      kind: 'codebookNode',
      typeId: 'person',
    });
    expect(
      compoundFailureMessage(
        {
          kind: 'result',
          result: {
            status: 'blocked',
            blockedSections: [
              {
                sectionId: blockedSection,
                holder: {
                  sessionId: 'session-1',
                  userId: 'user-1',
                  displayName: 'Ana',
                  sectionId: blockedSection,
                  mode: 'editing',
                },
              },
            ],
          },
        },
        esIntl,
      ),
    ).toBe(
      'Ana está editando ahora mismo una sección necesaria para este cambio.',
    );
  });
});
