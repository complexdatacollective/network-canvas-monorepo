import { describe, expect, it } from 'vitest';

import { esIntl, readMessage } from '../../testing/i18n.ts';
import {
  resourceProblemMessage,
  schemaProblemSentence,
} from '../schemaProblems.ts';

/**
 * What the outline says about a refused stage, read in Spanish.
 *
 * These sentences are decided in `SectionOutlineStore`, which has no reader
 * and no language, so they travel to the outline as encoded descriptors and
 * are resolved where they are rendered. That is the only route in this package
 * where the WORDS and the reader are separated by a store, so it is the one
 * most likely to end up permanently English — and this is what would notice.
 */
describe('schema refusals, read in Spanish', () => {
  it('names the control inside the translated sentence', () => {
    expect(
      readMessage(
        schemaProblemSentence(
          { code: 'too_big', message: 'Too big', absent: false },
          'Tipo de nodo',
        ),
        esIntl,
      ),
    ).toBe('Tipo de nodo contiene más de lo que permite esta etapa.');
  });

  it('says a missing value is missing in the reader’s language', () => {
    expect(
      readMessage(
        schemaProblemSentence(
          { code: 'invalid_type', message: 'Invalid input', absent: true },
          'Tipo de nodo',
        ),
        esIntl,
      ),
    ).toBe('Tipo de nodo no tiene ningún valor, y esta etapa necesita uno.');
  });

  /**
   * The one refusal whose words are not this package's: a cross-reference rule
   * the protocol schema wrote is already about this protocol, so it is handed
   * back as it stands — in whatever language it arrived in, which no reader's
   * formatter can change. Asserted here so the pass-through is a decision on
   * the record rather than a gap.
   */
  it('hands back a sentence the schema wrote, untranslated', () => {
    expect(
      readMessage(
        schemaProblemSentence(
          {
            code: 'custom',
            message: 'An ego rule must reference an attribute.',
            absent: false,
          },
          'Reglas',
        ),
        esIntl,
      ),
    ).toBe('An ego rule must reference an attribute.');
  });

  it('names the resource inside the translated sentence', () => {
    expect(
      esIntl.formatMessage(
        resourceProblemMessage({ code: 'invalid_type', absent: false }),
        { resourceId: 'map-layers' },
      ),
    ).toBe(
      'Esta etapa apunta a un recurso («map-layers») que el protocolo no puede leer: parte de su entrada contiene un valor de un tipo equivocado.',
    );
  });
});
