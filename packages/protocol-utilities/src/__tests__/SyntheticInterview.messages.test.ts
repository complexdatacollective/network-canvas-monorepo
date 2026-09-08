import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import {
  type ConstraintReasonCode,
  SyntheticDataConstraintError,
} from '../generateNetwork/constraints/error.ts';
import { protocolUtilitiesCatalogs } from '../locales/catalogs.ts';
import { formatConstraintConflictReason } from '../messages.ts';
import { SyntheticInterview } from '../SyntheticInterview.ts';

type RefusalCase = {
  name: string;
  build: () => SyntheticInterview;
  reasonCode: ConstraintReasonCode;
  variableNames: string[];
  diagnostic: RegExp;
  english: string;
  spanish: string;
};

const refusals: RefusalCase[] = [
  {
    name: 'unsupported ego uniqueness',
    build: () => {
      const interview = new SyntheticInterview(42);
      interview.addEgoVariable({
        name: 'Participant code',
        type: 'text',
        validation: { unique: true },
      });
      return interview;
    },
    reasonCode: 'uniqueEgo',
    variableNames: ['Participant code'],
    diagnostic: /unique is not supported on ego variables/,
    english:
      'Unique values are not supported for participant attributes. Remove this validation rule.',
    spanish:
      'Los valores únicos no se admiten en los atributos del participante. Elimina esta regla de validación.',
  },
  {
    name: 'duplicate fixed node values',
    build: () => {
      const interview = new SyntheticInterview(42);
      const person = interview.addNodeType({ name: 'Person' });
      const code = person.addVariable({
        name: 'Code',
        type: 'text',
        validation: { unique: true },
      });
      interview.addStage('Sociogram', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 2 },
      });
      interview.setNodeAttribute(0, code.id, 'Raven');
      interview.setNodeAttribute(1, code.id, 'Raven');
      return interview;
    },
    reasonCode: 'duplicateFixedValues',
    variableNames: ['Code'],
    diagnostic: /the caller sets this to "Raven" on two nodes/,
    english:
      'The same value is assigned to multiple nodes or links, but the value must be unique. Change the fixed values or the uniqueness rule.',
    spanish:
      'Se asigna el mismo valor a varios nodos o vínculos, pero el valor debe ser único. Cambia los valores fijos o la regla de unicidad.',
  },
  {
    name: 'contradictory fixed edge values',
    build: () => {
      const interview = new SyntheticInterview(42);
      const friendship = interview.addEdgeType({ name: 'Friendship' });
      const first = friendship.addVariable({ name: 'First', type: 'number' });
      const confirmation = friendship.addVariable({
        name: 'Confirmation',
        type: 'number',
        validation: { sameAs: first.id },
      });
      interview.addStage('Sociogram', { initialNodes: { count: 2 } });
      interview.addEdges([[0, 1]], friendship.id);
      interview.setEdgeAttribute(0, first.id, 10);
      interview.setEdgeAttribute(0, confirmation.id, 20);
      return interview;
    },
    reasonCode: 'fixedValueRejected',
    variableNames: ['First', 'Confirmation'],
    diagnostic: /the caller sets these variables on one edge to 10 and 20/,
    english:
      'The assigned fixed values conflict with these validation rules. Change the fixed values or the conflicting rules.',
    spanish:
      'Los valores fijos asignados entran en conflicto con estas reglas de validación. Cambia los valores fijos o las reglas incompatibles.',
  },
  {
    name: 'undrawable ego values',
    build: () => {
      const interview = new SyntheticInterview(42);
      interview.addEgoVariable({
        name: 'Biography',
        type: 'text',
        validation: { minLength: 10, maxLength: 5 },
      });
      return interview;
    },
    reasonCode: 'noSolution',
    variableNames: ['Biography'],
    diagnostic:
      /the closest value these rules leave drawable is .*maxLength rejects/,
    english:
      'No combination of permitted values satisfies all these rules. Review the rules for the listed attributes.',
    spanish:
      'Ninguna combinación de valores permitidos satisface todas estas reglas. Revisa las reglas de los atributos indicados.',
  },
  {
    name: 'incompatible composer controls',
    build: () => {
      const interview = new SyntheticInterview(42);
      const person = interview.addNodeType({ name: 'Person' });
      const born = person.addVariable({
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2000-01-01', max: '2010-12-31' },
      });
      interview.addStage('AlterForm', {
        subject: { entity: 'node', type: person.id },
        form: {
          fields: [
            { variable: born.id, component: 'DatePicker', prompt: 'When?' },
          ],
        },
      });
      const composer = interview.addStage('NetworkComposer', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
      });
      composer.addNodeFormField({
        variable: born.id,
        component: 'DatePicker',
        parameters: { type: 'full', min: '2020-01-01', max: '2030-12-31' },
      });
      return interview;
    },
    reasonCode: 'incompatibleDateControls',
    variableNames: ['Born'],
    diagnostic: /date controls that have no common window at one resolution/,
    english:
      'Forms use incompatible input controls for the same attribute. Use controls that allow a common set of values.',
    spanish:
      'Los formularios usan controles de entrada incompatibles para el mismo atributo. Usa controles que permitan un conjunto común de valores.',
  },
];

describe.each(['en', 'en-GB', 'es'])(
  'SyntheticInterview refusal guidance in %s',
  (locale) => {
    it.each(refusals)(
      'presents $name without changing the diagnostic or data',
      (refusal) => {
        const interview = refusal.build();
        let caught: unknown;
        try {
          interview.getNetwork();
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(SyntheticDataConstraintError);
        if (!(caught instanceof SyntheticDataConstraintError)) {
          throw new Error(
            'Expected the builder to refuse the impossible values',
          );
        }
        expect(caught.conflicts).toHaveLength(1);
        const conflict = caught.conflicts[0];
        if (!conflict) throw new Error('Expected a specific refusal');
        expect(conflict.reasonCode).toBe(refusal.reasonCode);
        expect(conflict.variableNames).toEqual(refusal.variableNames);
        expect(conflict.reason).toMatch(refusal.diagnostic);
        const original = structuredClone(conflict);
        const diagnostic = caught.message;
        const intl = createAppIntl({
          locale,
          messages: protocolUtilitiesCatalogs[locale],
        });
        expect(formatConstraintConflictReason(conflict, intl)).toBe(
          locale === 'es' ? refusal.spanish : refusal.english,
        );
        expect(conflict).toEqual(original);
        expect(caught.message).toBe(diagnostic);
      },
    );
  },
);
