import type { DocumentFragment as XmlDomDocumentFragment } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  egoProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  nodeExportIDProperty,
} from '@codaco/shared-consts';

import type { NodeWithResequencedID } from '../../../input';
import type { ExportOptions } from '../../../options';
import getKeyElementGenerator from '../generateKeyElements';
import processAttributes from '../processAttributes';

const mockExportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

const keyIdsFor = async (codebook: Codebook, node: NodeWithResequencedID) =>
  (
    await getKeyElementGenerator(
      codebook,
      mockExportOptions,
    )({ ego: [], node: [node], edge: [] })
  ).keyIds;

// Helper to extract data elements from the document fragment
const getDataElements = (fragment: XmlDomDocumentFragment) => {
  const result: Record<string, string> = {};
  for (const child of fragment.children) {
    const key = child.getAttribute('key');
    if (key) {
      result[key] = child.textContent ?? '';
    }
  }
  return result;
};

describe('processAttributes', () => {
  describe('categorical variables', () => {
    it('should not match substring values in categorical options', async () => {
      // This test verifies that "male" is NOT matched when only "female" is selected
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
          'gender-uuid': ['female'], // Only female is selected
        },
      } as unknown as NodeWithResequencedID;

      const result = processAttributes(
        node,
        codebook,
        mockExportOptions,
        await keyIdsFor(codebook, node),
      );
      const dataElements = getDataElements(result);

      // The keys are hashed, so we need to find them by looking for true/false values
      // Female should be true, male should be false
      const values = Object.values(dataElements);
      const trueCount = values.filter((v) => v === 'true').length;
      const falseCount = values.filter((v) => v === 'false').length;

      expect(trueCount).toBe(1); // Only female
      expect(falseCount).toBe(1); // male is false
    });

    it('matches numeric-like categorical option values without substring matching', async () => {
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
      } as unknown as NodeWithResequencedID;

      const result = processAttributes(
        node,
        codebook,
        mockExportOptions,
        await keyIdsFor(codebook, node),
      );
      const dataElements = getDataElements(result);

      const values = Object.values(dataElements);
      const trueCount = values.filter((v) => v === 'true').length;
      const falseCount = values.filter((v) => v === 'false').length;

      expect(trueCount).toBe(1); // Only '10' should be true
      expect(falseCount).toBe(2); // '1' and '100' should be false
    });
  });

  describe('encrypted variables', () => {
    const codebook: Codebook = {
      node: {
        person: {
          name: 'person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            'name-uuid': {
              name: 'name',
              label: 'Name',
              type: 'text',
              encrypted: true,
            },
            'city-uuid': { name: 'city', label: 'City', type: 'text' },
          },
        },
      },
    };
    const ciphertext = [201, 17, 93, 4, 250, 66, 128, 7, 33, 180, 2, 99];

    it.each([
      {
        label: 'metadata without a salt',
        metadata: { iv: [15, 243, 77, 120] },
      },
      {
        label: 'schema 8 metadata with a salt',
        metadata: { iv: [15, 243, 77, 120], salt: [44, 130, 213, 61] },
      },
    ])(
      'writes the marker in place of the ciphertext, with $label',
      async ({ metadata }) => {
        const node: NodeWithResequencedID = {
          [entityPrimaryKeyProperty]: '1',
          [egoProperty]: 'ego-1',
          [nodeExportIDProperty]: 1,
          type: 'person',
          [entityAttributesProperty]: {
            'name-uuid': ciphertext,
            'city-uuid': 'Lisbon',
          },
          [entitySecureAttributesMeta]: { 'name-uuid': metadata },
        };

        const result = processAttributes(
          node,
          codebook,
          mockExportOptions,
          await keyIdsFor(codebook, node),
        );
        const values = Object.values(getDataElements(result));

        expect(values).toHaveLength(2);
        expect(values).toContain('ENCRYPTED');
        expect(values).toContain('Lisbon');
        expect(values.join('')).not.toContain(ciphertext.join(','));
      },
    );
  });
});
