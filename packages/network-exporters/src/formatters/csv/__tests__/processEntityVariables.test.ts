import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { ExportOptions } from '../../../options';
import processEntityVariables from '../processEntityVariables';

const mockExportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

describe('processEntityVariables', () => {
  describe('categorical variables', () => {
    it('should not match substring values in categorical options', () => {
      // This test verifies that "male" is NOT matched when only "female" is selected
      // This is the bug: includes() was doing substring matching, so "male" in "female" was true
      const codebook = {
        node: {
          person: {
            name: 'person',
            color: 'color',
            variables: {
              'gender-uuid': {
                name: 'gender',
                type: 'categorical',
                options: [
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'non-binary', label: 'Non-binary' },
                ],
              },
            },
          },
        },
      } as unknown as Codebook;

      const node = {
        [entityPrimaryKeyProperty]: '1',
        type: 'person',
        [entityAttributesProperty]: {
          'gender-uuid': ['female'], // Only female is selected
        },
      } as unknown as NcNode;

      const result = processEntityVariables(
        node,
        'node',
        codebook,
        mockExportOptions,
      );

      // female should be true, male and non-binary should be false
      expect(result.attributes).toEqual({
        'gender_male': false,
        'gender_female': true,
        'gender_non-binary': false,
      });
    });

    it('should correctly match multiple selected categorical values', () => {
      const codebook = {
        node: {
          person: {
            name: 'person',
            color: 'color',
            variables: {
              'color-uuid': {
                name: 'favoriteColors',
                type: 'categorical',
                options: [
                  { value: 'red', label: 'Red' },
                  { value: 'redish', label: 'Redish' },
                  { value: 'blue', label: 'Blue' },
                  { value: 'blueberry', label: 'Blueberry' },
                ],
              },
            },
          },
        },
      } as unknown as Codebook;

      const node = {
        [entityPrimaryKeyProperty]: '1',
        type: 'person',
        [entityAttributesProperty]: {
          'color-uuid': ['red', 'blue'], // Only red and blue selected, not redish or blueberry
        },
      } as unknown as NcNode;

      const result = processEntityVariables(
        node,
        'node',
        codebook,
        mockExportOptions,
      );

      expect(result.attributes).toEqual({
        favoriteColors_red: true,
        favoriteColors_redish: false,
        favoriteColors_blue: true,
        favoriteColors_blueberry: false,
      });
    });

    it('should handle numeric categorical values correctly', () => {
      const codebook = {
        node: {
          person: {
            name: 'person',
            color: 'color',
            variables: {
              'rating-uuid': {
                name: 'rating',
                type: 'categorical',
                options: [
                  { value: 1, label: 'One' },
                  { value: 10, label: 'Ten' },
                  { value: 100, label: 'One Hundred' },
                ],
              },
            },
          },
        },
      } as unknown as Codebook;

      const node = {
        [entityPrimaryKeyProperty]: '1',
        type: 'person',
        [entityAttributesProperty]: {
          'rating-uuid': [10], // Only 10 selected
        },
      } as unknown as NcNode;

      const result = processEntityVariables(
        node,
        'node',
        codebook,
        mockExportOptions,
      );

      // 10 should be true, 1 and 100 should be false (not substring matched)
      expect(result.attributes).toEqual({
        rating_1: false,
        rating_10: true,
        rating_100: false,
      });
    });

    it('should handle empty categorical selection', () => {
      const codebook = {
        node: {
          person: {
            name: 'person',
            color: 'color',
            variables: {
              'gender-uuid': {
                name: 'gender',
                type: 'categorical',
                options: [
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ],
              },
            },
          },
        },
      } as unknown as Codebook;

      const node = {
        [entityPrimaryKeyProperty]: '1',
        type: 'person',
        [entityAttributesProperty]: {
          'gender-uuid': [], // Nothing selected
        },
      } as unknown as NcNode;

      const result = processEntityVariables(
        node,
        'node',
        codebook,
        mockExportOptions,
      );

      expect(result.attributes).toEqual({
        gender_male: false,
        gender_female: false,
      });
    });

    it('should handle null categorical data', () => {
      const codebook = {
        node: {
          person: {
            name: 'person',
            color: 'color',
            variables: {
              'gender-uuid': {
                name: 'gender',
                type: 'categorical',
                options: [
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ],
              },
            },
          },
        },
      } as unknown as Codebook;

      const node = {
        [entityPrimaryKeyProperty]: '1',
        type: 'person',
        [entityAttributesProperty]: {
          'gender-uuid': null,
        },
      } as unknown as NcNode;

      const result = processEntityVariables(
        node,
        'node',
        codebook,
        mockExportOptions,
      );

      expect(result.attributes).toEqual({
        gender_male: false,
        gender_female: false,
      });
    });

    it('matches numeric-like categorical option values without substring matching', () => {
      // Categorical attributes are stored as arrays; ['10'] must match only the
      // '10' option, not '1' or '100' via substring matching.
      const codebook = {
        node: {
          person: {
            name: 'person',
            color: 'color',
            variables: {
              'rating-uuid': {
                name: 'rating',
                type: 'categorical',
                options: [
                  { value: '1', label: 'One' },
                  { value: '10', label: 'Ten' },
                  { value: '100', label: 'One Hundred' },
                ],
              },
            },
          },
        },
      } as unknown as Codebook;

      const node = {
        [entityPrimaryKeyProperty]: '1',
        type: 'person',
        [entityAttributesProperty]: {
          'rating-uuid': ['10'],
        },
      } as unknown as NcNode;

      const result = processEntityVariables(
        node,
        'node',
        codebook,
        mockExportOptions,
      );

      expect(result.attributes).toEqual({
        rating_1: false,
        rating_10: true,
        rating_100: false,
      });
    });
  });
});
