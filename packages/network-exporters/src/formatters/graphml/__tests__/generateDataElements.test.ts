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
import getDataElementGenerator from '../generateDataElements';

const exportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: false,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

const codebookWithName = (encrypted: boolean): Codebook => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'name-uuid': { name: 'name', type: 'text', encrypted },
      },
    },
  },
});

const getNodeLabel = async (
  node: NodeWithResequencedID,
  codebook: Codebook,
) => {
  const fragment = await getDataElementGenerator(
    codebook,
    exportOptions,
    new Map(),
  )([node]);
  const [nodeElement] = Array.from(fragment.children);
  const label = Array.from(
    nodeElement?.getElementsByTagName('data') ?? [],
  ).find((element) => element.getAttribute('key') === 'label');
  return label?.textContent;
};

describe('GraphML node labels', () => {
  it('labels a node "Encrypted" when its name was saved as ciphertext, though the codebook no longer asks for encryption', async () => {
    const node: NodeWithResequencedID = {
      [entityPrimaryKeyProperty]: '1',
      [egoProperty]: 'ego-1',
      [nodeExportIDProperty]: 1,
      type: 'person',
      [entityAttributesProperty]: { 'name-uuid': [12, 34, 56] },
      [entitySecureAttributesMeta]: {
        'name-uuid': { iv: [1], salt: [2] },
      },
    };

    expect(await getNodeLabel(node, codebookWithName(false))).toBe('Encrypted');
  });

  it('labels a node with its name when the name was saved as plaintext, though the codebook now asks for encryption', async () => {
    const node: NodeWithResequencedID = {
      [entityPrimaryKeyProperty]: '1',
      [egoProperty]: 'ego-1',
      [nodeExportIDProperty]: 1,
      type: 'person',
      [entityAttributesProperty]: { 'name-uuid': 'Alice' },
    };

    expect(await getNodeLabel(node, codebookWithName(true))).toBe('Alice');
  });
});
