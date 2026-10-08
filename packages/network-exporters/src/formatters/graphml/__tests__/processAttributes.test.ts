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

  describe('encrypted values', () => {
    const codebookWithName = (encrypted: boolean): Codebook => ({
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
              encrypted,
            },
          },
        },
      },
    });

    it('exports a value saved as ciphertext as ENCRYPTED, though the codebook no longer asks for encryption', async () => {
      const node: NodeWithResequencedID = {
        [entityPrimaryKeyProperty]: '1',
        [egoProperty]: 'ego-1',
        [nodeExportIDProperty]: 1,
        type: 'person',
        [entityAttributesProperty]: {
          'name-uuid': [12, 34, 56],
          'external-uuid': [78, 90],
        },
        [entitySecureAttributesMeta]: {
          'name-uuid': { iv: [1], salt: [2] },
          'external-uuid': { iv: [3], salt: [4] },
        },
      };

      const codebook = codebookWithName(false);
      const keyIds = await keyIdsFor(codebook, node);
      const result = await processAttributes(
        node,
        codebook,
        mockExportOptions,
        keyIds,
      );

      expect(getDataElements(result)).toEqual({
        'name-uuid': 'ENCRYPTED',
        [keyIds.external.get('external-uuid') ?? '']: 'ENCRYPTED',
      });
    });

    it('exports a value saved as plaintext as itself, though the codebook now asks for encryption', async () => {
      const node: NodeWithResequencedID = {
        [entityPrimaryKeyProperty]: '1',
        [egoProperty]: 'ego-1',
        [nodeExportIDProperty]: 1,
        type: 'person',
        [entityAttributesProperty]: { 'name-uuid': 'Alice' },
      };

      const codebook = codebookWithName(true);
      const result = await processAttributes(
        node,
        codebook,
        mockExportOptions,
        await keyIdsFor(codebook, node),
      );

      expect(getDataElements(result)).toEqual({ 'name-uuid': 'Alice' });
    });

    it('exports a plaintext value as itself, though metadata from an encrypted value it replaced was left with it', async () => {
      const node: NodeWithResequencedID = {
        [entityPrimaryKeyProperty]: '1',
        [egoProperty]: 'ego-1',
        [nodeExportIDProperty]: 1,
        type: 'person',
        [entityAttributesProperty]: { 'name-uuid': 'Alice' },
        [entitySecureAttributesMeta]: {
          'name-uuid': { iv: [1], salt: [2] },
        },
      };

      const codebook = codebookWithName(true);
      const result = await processAttributes(
        node,
        codebook,
        mockExportOptions,
        await keyIdsFor(codebook, node),
      );

      expect(getDataElements(result)).toEqual({ 'name-uuid': 'Alice' });
    });
  });
});
