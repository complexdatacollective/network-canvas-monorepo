import { describe, expect, it } from 'vitest';

import type { FieldValue } from '../../store/types';
import { getComparisonValue } from './getComparisonValue';

describe('getComparisonValue', () => {
  it('does not resolve an inherited form value', () => {
    const formValues: Record<string, FieldValue> = {
      __proto__: { compared: 'inherited' },
    };

    expect(getComparisonValue(formValues, 'compared')).toEqual({
      present: false,
      value: undefined,
    });
    expect(Object.hasOwn(Object.prototype, 'compared')).toBe(false);
  });

  it('treats a dotted comparison variable as one own key', () => {
    const formValues = { 'favorite.color': 'blue' };

    expect(getComparisonValue(formValues, 'favorite.color')).toEqual({
      present: true,
      value: 'blue',
    });
  });

  it.each(['settings["locale"]', 'matrix[0][1]'])(
    'uses legacy parsing for the public namespace %s',
    (namespace) => {
      const formValues = {
        [namespace]: { compared: 'legacy' },
        settings: { locale: { compared: 'structural' } },
      };

      expect(
        getComparisonValue(formValues, 'compared', {
          formValueNamespace: namespace,
          stageSubject: { entity: 'ego' },
          codebook: {},
          network: {
            ego: { _uid: 'ego', attributes: {} },
            nodes: [],
            edges: [],
          },
        }),
      ).toEqual({ present: true, value: 'legacy' });
    },
  );

  it.each(['__proto__', 'prototype', 'constructor'])(
    'resolves the inert own comparison property %s',
    (attribute) => {
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(
        Object.prototype,
        attribute,
      );
      const formValues: Record<string, FieldValue> = {};
      Object.defineProperty(formValues, attribute, {
        enumerable: true,
        value: 'preserved',
      });

      expect(getComparisonValue(formValues, attribute)).toEqual({
        present: true,
        value: 'preserved',
      });
      expect(
        Object.getOwnPropertyDescriptor(Object.prototype, attribute),
      ).toEqual(prototypeDescriptor);
    },
  );

  describe('a variable that the form asks', () => {
    const context = (
      entity: 'ego' | 'node',
    ): Parameters<typeof getComparisonValue>[2] => ({
      stageSubject: entity === 'ego' ? { entity } : { entity, type: 'person' },
      codebook: {},
      network: {
        ego: { _uid: 'ego', attributes: { hidden: 'stored', other: 'kept' } },
        nodes: [
          {
            _uid: 'node-1',
            type: 'person',
            attributes: { hidden: 'stored', other: 'kept' },
          },
        ],
        edges: [],
      },
      currentEntityId: 'node-1',
      currentEntityAttributes: { pending: 'pending' },
      formVariables: ['hidden', 'shown', 'pending', 'aliased'],
      formValueAliases: { aliased: 'alias-key' },
    });

    it.each(['ego', 'node'] as const)(
      'has no answer on a %s form while its field is not mounted, whatever is stored',
      (entity) => {
        expect(getComparisonValue({}, 'hidden', context(entity))).toEqual({
          present: false,
          value: undefined,
        });
        expect(getComparisonValue({}, 'pending', context(entity))).toEqual({
          present: false,
          value: undefined,
        });
      },
    );

    it('reads the form’s value while its field is mounted', () => {
      expect(
        getComparisonValue(
          { 'shown': 'typed', 'alias-key': 'aliased' },
          'shown',
          context('ego'),
        ),
      ).toEqual({ present: true, value: 'typed' });
      expect(
        getComparisonValue({ 'alias-key': 'typed' }, 'aliased', context('ego')),
      ).toEqual({ present: true, value: 'typed' });
    });

    it('leaves a variable that the form does not ask to what is stored', () => {
      expect(getComparisonValue({}, 'other', context('node'))).toEqual({
        present: true,
        value: 'kept',
      });
    });
  });
});
