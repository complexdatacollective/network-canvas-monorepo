import {
  DOMParser,
  type Document,
  type Element,
  type LiveNodeList,
  MIME_TYPE,
} from '@xmldom/xmldom';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  ncSourceUUID,
  ncTargetUUID,
  ncTypeProperty,
  ncUUIDProperty,
} from '@codaco/shared-consts';

import type { ExportOptions } from '../../../options';
import {
  mockCodebook,
  mockExportOptions,
  mockNetwork,
  mockNetwork2,
  processMockNetworks,
} from '../../csv/__tests__/mockObjects';
import graphMLGenerator from '../createGraphML';

function getDataElementByKey(elements: Element[], key: string) {
  return elements.find((element) => element.getAttribute('key') === key);
}

function getNodeById(nodes: Element[], id: string) {
  return nodes.find((node) => node.getAttribute('id') === id);
}

const getChildElements = (parentEl: Element, elements: LiveNodeList<Element>) =>
  Array.from(elements).filter((el) => el.parentNode === parentEl);

const buildXML = async (...args: Parameters<typeof graphMLGenerator>) => {
  const xmlString = await graphMLGenerator(...args);

  const parser = new DOMParser();
  const result = parser.parseFromString(xmlString, MIME_TYPE.XML_APPLICATION);
  return result;
};

describe('buildGraphML', () => {
  const edgeTypeDef = mockCodebook.edge?.['mock-edge-type'] as
    | { name: string }
    | undefined;
  const nodeTypeDef = mockCodebook.node?.['mock-node-type'] as
    | { name: string }
    | undefined;
  if (!edgeTypeDef || !nodeTypeDef)
    throw new Error('Mock codebook is missing expected type definitions');
  const edgeType = edgeTypeDef.name;
  const nodeType = nodeTypeDef.name;
  const codebook = mockCodebook as unknown as Codebook; // Codebook type mistakenly requires variables on all entities - fixed in schema 8
  let exportOptions: ExportOptions;
  let xml: Document;

  beforeEach(async () => {
    exportOptions = {
      ...mockExportOptions,
      exportGraphML: true,
    };

    const processedNetworks = processMockNetworks([mockNetwork, mockNetwork2]);
    const protocolSessions = processedNetworks['protocol-uid-1'];
    const protocolNetwork = protocolSessions?.[0];
    if (!protocolNetwork) throw new Error('No sessions for protocol-uid-1');
    xml = await buildXML(protocolNetwork, codebook, exportOptions);
  });

  it('produces a graphml document', () => {
    expect(xml.getElementsByTagName('graphml')).toHaveLength(1);
  });

  it('creates a single graph element when not merging', () => {
    expect(xml.getElementsByTagName('graph')).toHaveLength(1);
  });

  it('defaults to undirected edges', () => {
    const graphElement = xml.getElementsByTagName('graph')[0];
    expect(graphElement?.getAttribute('edgedefault')).toEqual('undirected');
  });

  it('adds nodes', () => {
    expect(xml.getElementsByTagName('node')).toHaveLength(4);
  });

  it('adds edges', () => {
    expect(xml.getElementsByTagName('edge')).toHaveLength(1);
  });

  it('adds node and edge type data key', () => {
    const node = xml.getElementsByTagName('node')[0];
    const edge = xml.getElementsByTagName('edge')[0];

    const nodeTypeDataElement = node
      ? getDataElementByKey(
          Array.from(node.getElementsByTagName('data')),
          'networkCanvasType',
        )
      : undefined;
    const edgeTypeDataElement = edge
      ? getDataElementByKey(
          Array.from(edge.getElementsByTagName('data')),
          'networkCanvasType',
        )
      : undefined;

    expect(nodeTypeDataElement?.textContent).toEqual(nodeType);
    expect(edgeTypeDataElement?.textContent).toEqual(edgeType);
  });

  describe('ego', () => {
    it('adds ego data', () => {
      const graphElement = xml.getElementsByTagName('graph')[0];
      if (!graphElement) throw new Error('Missing graph element');

      const graphData = getChildElements(
        graphElement,
        xml.getElementsByTagName('data'),
      ).reduce<Record<string, string | null>>((acc, node) => {
        const key = node.getAttribute('key');
        if (key) {
          acc[key] = node.textContent;
        }
        return acc;
      }, {});

      expect(graphData).toMatchObject({
        [ncUUIDProperty]: 'ego-id-1',
        'mock-uuid-1': 'Enzo',
        'mock-uuid-2': '40',
        'mock-uuid-3': 'false',
      });
    });
  });

  it('infers int types', () => {
    // This indicates that transposition worked for nodes
    expect(
      xml.getElementById('mock-uuid-2')?.getAttribute('attr.type'),
    ).toEqual('int');
  });

  it('converts layout types', () => {
    expect(
      xml.getElementById('mock-uuid-3_X')?.getAttribute('attr.type'),
    ).toEqual('double');
    expect(
      xml.getElementById('mock-uuid-3_Y')?.getAttribute('attr.type'),
    ).toEqual('double');
  });

  it('exports edge labels', () => {
    // This indicates that [non-]transposition worked for edges
    const edge = xml.getElementsByTagName('edge')[0];
    expect(edge?.getElementsByTagName('data')[1]?.textContent).toEqual(
      edgeType,
    );
  });

  it('includes 0 and false values', () => {
    const carl = getNodeById(Array.from(xml.getElementsByTagName('node')), '2');
    if (!carl) throw new Error('Missing carl node');

    const zeroValue = getDataElementByKey(
      Array.from(carl.getElementsByTagName('data')),
      'mock-uuid-2',
    );
    const falseValue = getDataElementByKey(
      Array.from(carl.getElementsByTagName('data')),
      'mock-uuid-4',
    );

    expect(zeroValue?.textContent).toEqual('0');
    expect(falseValue?.textContent).toEqual('false');
  });

  it('adds a data element for the node label, based on the codebook name attribute', () => {
    const nodes = Array.from(xml.getElementsByTagName('node'));
    // Expect that each node has a data element with the key 'name'
    for (const node of nodes) {
      const dataElements = node.getElementsByTagName('data');

      // Find the data element with key="label"
      let labelElement = null;
      for (const dataEl of Array.from(dataElements)) {
        if (dataEl.getAttribute('key') === 'label') {
          labelElement = dataEl;
          break;
        }
      }

      // Assert that the label element exists
      expect(labelElement).not.toBeNull();
    }
  });

  it('does not emit data elements for absent values', () => {
    const nodes = Array.from(xml.getElementsByTagName('node'));
    const dee = getNodeById(nodes, '1');
    if (!dee) throw new Error('Missing dee node');
    const deeData = Array.from(dee.getElementsByTagName('data'));

    expect(deeData.length).toEqual(10);
    expect(getDataElementByKey(deeData, 'mock-uuid-5')?.textContent).toEqual(
      undefined,
    );

    const carl = getNodeById(nodes, '2');
    if (!carl) throw new Error('Missing carl node');
    const carlData = Array.from(carl.getElementsByTagName('data'));
    expect(carlData.length).toEqual(10);
    expect(getDataElementByKey(carlData, 'mock-uuid-5')?.textContent).toEqual(
      undefined,
    );

    const jumbo = getNodeById(nodes, '3');
    if (!jumbo) throw new Error('Missing jumbo node');
    expect(jumbo.getElementsByTagName('data').length).toEqual(6);

    const francis = getNodeById(nodes, '4');
    if (!francis) throw new Error('Missing francis node');
    const francisData = Array.from(francis.getElementsByTagName('data'));
    expect(francis.getElementsByTagName('data').length).toEqual(9);
    expect(
      getDataElementByKey(francisData, 'mock-uuid-5')?.textContent,
    ).toEqual(undefined);
    expect(
      getDataElementByKey(francisData, 'mock-uuid-4')?.textContent,
    ).toEqual(undefined);
  });

  it('includes keys for all used variables', () => {
    const graphKeys = Array.from(xml.getElementsByTagName('key'))
      .filter((key) => ['node', 'all'].includes(key.getAttribute('for') ?? ''))
      .map((key) => key.getAttribute('id'));

    expect(graphKeys).toEqual(
      expect.arrayContaining([
        'mock-uuid-1',
        'mock-uuid-2',
        'mock-uuid-3_X',
        'mock-uuid-3_screenSpaceY',
        'mock-uuid-3_screenSpaceX',
        'mock-uuid-3_Y',
        'mock-uuid-4',
        'mock-uuid-5',
      ]),
    );
  });

  it('includes node base keys when there are zero nodes', async () => {
    const processedNetworks = processMockNetworks([mockNetwork]);
    const protocolNetwork = processedNetworks['protocol-uid-1']?.[0];
    if (!protocolNetwork) throw new Error('Missing protocol network');

    const emptyNodeXml = await buildXML(
      { ...protocolNetwork, nodes: [] },
      codebook,
      exportOptions,
    );

    expect(emptyNodeXml.getElementById(ncUUIDProperty)).not.toBeNull();
    expect(emptyNodeXml.getElementById(ncTypeProperty)).not.toBeNull();
    expect(emptyNodeXml.getElementById('mock-uuid-1')).not.toBeNull();
    expect(
      emptyNodeXml.getElementById('unrepresented-node-variable'),
    ).not.toBeNull();
  });

  it('includes edge base keys when there are zero edges', async () => {
    const processedNetworks = processMockNetworks([mockNetwork]);
    const protocolNetwork = processedNetworks['protocol-uid-1']?.[0];
    if (!protocolNetwork) throw new Error('Missing protocol network');

    const emptyEdgeXml = await buildXML(
      { ...protocolNetwork, edges: [] },
      codebook,
      exportOptions,
    );

    expect(emptyEdgeXml.getElementById(ncSourceUUID)).not.toBeNull();
    expect(emptyEdgeXml.getElementById(ncTargetUUID)).not.toBeNull();
    expect(
      emptyEdgeXml.getElementById('unrepresented-edge-variable'),
    ).not.toBeNull();
  });

  it('includes declarations from unrepresented node types', () => {
    const key = xml.getElementById('unrepresented-node-variable');

    expect(key?.getAttribute('for')).toBe('node');
    expect(key?.getAttribute('attr.name')).toBe('unrepresentedNodeVariable');
  });

  it('includes declarations from unrepresented edge types', () => {
    const key = xml.getElementById('unrepresented-edge-variable');

    expect(key?.getAttribute('for')).toBe('edge');
    expect(key?.getAttribute('attr.name')).toBe('unrepresentedEdgeVariable');
  });

  it('includes fully unanswered declared keys without emitting data', () => {
    expect(xml.getElementById('mock-uuid-6')).not.toBeNull();
    expect(
      Array.from(xml.getElementsByTagName('data')).some(
        (element) => element.getAttribute('key') === 'mock-uuid-6',
      ),
    ).toBe(false);
  });

  it('derives stable types for unanswered variables from the codebook', async () => {
    const processedNetworks = processMockNetworks([mockNetwork]);
    const protocolNetwork = processedNetworks['protocol-uid-1']?.[0];
    if (!protocolNetwork) throw new Error('Missing protocol network');
    const representedNodeType = codebook.node?.['mock-node-type'];
    if (!representedNodeType) throw new Error('Missing represented node type');

    const unansweredCodebook: Codebook = {
      ...codebook,
      node: {
        ...codebook.node,
        'mock-node-type': {
          ...representedNodeType,
          variables: {
            ...representedNodeType.variables,
            unansweredNumber: { name: 'unansweredNumber', type: 'number' },
            unansweredNumericOrdinal: {
              name: 'unansweredNumericOrdinal',
              type: 'ordinal',
              options: [
                { label: 'One', value: 1 },
                { label: 'Two', value: 2 },
              ],
            },
          },
        },
        'unanswered': {
          name: 'unanswered',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            unrepresentedNumber: {
              name: 'unrepresentedNumber',
              type: 'number',
            },
            unrepresentedNumericOrdinal: {
              name: 'unrepresentedNumericOrdinal',
              type: 'ordinal',
              options: [
                { label: 'One', value: 1 },
                { label: 'Two', value: 2 },
              ],
            },
            stringOrdinal: {
              name: 'stringOrdinal',
              type: 'ordinal',
              options: [
                { label: 'One', value: 'one' },
                { label: 'Two', value: 'two' },
              ],
            },
            emptyOrdinal: {
              name: 'emptyOrdinal',
              type: 'ordinal',
              options: [],
            },
            text: { name: 'text', type: 'text' },
            boolean: { name: 'boolean', type: 'boolean' },
            categorical: {
              name: 'categorical',
              type: 'categorical',
              options: [
                { label: 'One', value: 1 },
                { label: 'Two', value: 2 },
              ],
            },
          },
        },
      },
    };

    const unansweredXml = await buildXML(
      protocolNetwork,
      unansweredCodebook,
      exportOptions,
    );

    expect(
      unansweredXml
        .getElementById('unansweredNumber')
        ?.getAttribute('attr.type'),
    ).toBe('double');
    expect(
      unansweredXml
        .getElementById('unansweredNumericOrdinal')
        ?.getAttribute('attr.type'),
    ).toBe('int');
    expect(
      unansweredXml
        .getElementById('unrepresentedNumber')
        ?.getAttribute('attr.type'),
    ).toBe('double');
    expect(
      unansweredXml
        .getElementById('unrepresentedNumericOrdinal')
        ?.getAttribute('attr.type'),
    ).toBe('int');
    expect(
      unansweredXml.getElementById('stringOrdinal')?.getAttribute('attr.type'),
    ).toBe('string');
    expect(
      unansweredXml.getElementById('emptyOrdinal')?.getAttribute('attr.type'),
    ).toBe('string');
    expect(
      unansweredXml.getElementById('text')?.getAttribute('attr.type'),
    ).toBe('string');
    expect(
      unansweredXml.getElementById('boolean')?.getAttribute('attr.type'),
    ).toBe('boolean');

    const categoricalKeys = Array.from(
      unansweredXml.getElementsByTagName('key'),
    ).filter((key) =>
      key.getAttribute('attr.name')?.startsWith('categorical_'),
    );
    expect(categoricalKeys).toHaveLength(2);
    expect(
      categoricalKeys.every(
        (key) => key.getAttribute('attr.type') === 'boolean',
      ),
    ).toBe(true);
  });

  it('includes present external attributes with stable key references', async () => {
    const processedNetworks = processMockNetworks([mockNetwork]);
    const protocolNetwork = processedNetworks['protocol-uid-1']?.[0];
    if (!protocolNetwork) throw new Error('Missing protocol network');

    const externalXml = await buildXML(
      {
        ...protocolNetwork,
        nodes: protocolNetwork.nodes.map((node, index) =>
          index === 0
            ? {
                ...node,
                [entityAttributesProperty]: {
                  ...node[entityAttributesProperty],
                  externalAttribute: 'external value',
                },
              }
            : node,
        ),
      },
      codebook,
      exportOptions,
    );

    const externalKey = Array.from(
      externalXml.getElementsByTagName('key'),
    ).find(
      (element) => element.getAttribute('attr.name') === 'externalAttribute',
    );
    const externalKeyId = externalKey?.getAttribute('id');
    if (!externalKeyId) throw new Error('Missing external attribute key');

    expect(externalKeyId).not.toBe('externalAttribute');
    expect(
      Array.from(externalXml.getElementsByTagName('data')).some(
        (element) =>
          element.getAttribute('key') === externalKeyId &&
          element.textContent === 'external value',
      ),
    ).toBe(true);
  });

  it('declares an external node attribute when another node type declares the same ID', async () => {
    const processedNetworks = processMockNetworks([mockNetwork]);
    const protocolNetwork = processedNetworks['protocol-uid-1']?.[0];
    if (!protocolNetwork) throw new Error('Missing protocol network');

    const collisionCodebook: Codebook = {
      ...codebook,
      node: {
        ...codebook.node,
        'declared-shared-node': {
          name: 'declared shared node',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'declaredShared', type: 'text' },
          },
        },
      },
    };
    const collisionXml = await buildXML(
      {
        ...protocolNetwork,
        nodes: protocolNetwork.nodes.map((node, index) =>
          index === 0
            ? {
                ...node,
                [entityAttributesProperty]: {
                  ...node[entityAttributesProperty],
                  shared: 'external shared value',
                },
              }
            : node,
        ),
      },
      collisionCodebook,
      exportOptions,
    );

    const keys = Array.from(collisionXml.getElementsByTagName('key'));
    const declaredKeys = keys.filter(
      (element) => element.getAttribute('id') === 'shared',
    );
    const externalKeys = keys.filter(
      (element) => element.getAttribute('attr.name') === 'shared',
    );
    const externalKeyId = externalKeys[0]?.getAttribute('id');
    if (!externalKeyId) throw new Error('Missing external shared key');

    expect(declaredKeys).toHaveLength(1);
    expect(externalKeys).toHaveLength(1);
    expect(externalKeyId).not.toBe('shared');
    expect(
      keys.filter((element) => element.getAttribute('id') === externalKeyId),
    ).toHaveLength(1);
    expect(
      Array.from(collisionXml.getElementsByTagName('data')).filter(
        (element) => element.getAttribute('key') === externalKeyId,
      ),
    ).toHaveLength(1);
  });

  it('uses one all-target key for the same external node and edge attribute', async () => {
    const processedNetworks = processMockNetworks([mockNetwork]);
    const protocolNetwork = processedNetworks['protocol-uid-1']?.[0];
    if (!protocolNetwork) throw new Error('Missing protocol network');

    const sharedExternalXml = await buildXML(
      {
        ...protocolNetwork,
        nodes: protocolNetwork.nodes.map((node, index) =>
          index === 0
            ? {
                ...node,
                [entityAttributesProperty]: {
                  ...node[entityAttributesProperty],
                  sharedExternal: 'node value',
                },
              }
            : node,
        ),
        edges: protocolNetwork.edges.map((edge, index) =>
          index === 0
            ? {
                ...edge,
                [entityAttributesProperty]: {
                  ...edge[entityAttributesProperty],
                  sharedExternal: 'edge value',
                },
              }
            : edge,
        ),
      },
      codebook,
      exportOptions,
    );

    const sharedKeys = Array.from(
      sharedExternalXml.getElementsByTagName('key'),
    ).filter(
      (element) => element.getAttribute('attr.name') === 'sharedExternal',
    );
    const sharedKeyId = sharedKeys[0]?.getAttribute('id');
    if (!sharedKeyId) throw new Error('Missing shared external key');

    expect(sharedKeys).toHaveLength(1);
    expect(sharedKeys[0]?.getAttribute('for')).toBe('all');
    expect(
      Array.from(sharedExternalXml.getElementsByTagName('key')).filter(
        (element) => element.getAttribute('id') === sharedKeyId,
      ),
    ).toHaveLength(1);
    expect(
      Array.from(sharedExternalXml.getElementsByTagName('data')).filter(
        (element) => element.getAttribute('key') === sharedKeyId,
      ),
    ).toHaveLength(2);
  });

  it('places <key> elements before any <graph> element', () => {
    const graphmlElement = xml.getElementsByTagName('graphml')[0];
    if (!graphmlElement) throw new Error('Missing graphml element');
    const childElements = Array.from(graphmlElement.childNodes).filter(
      (node) => node.nodeType === 1,
    ) as Element[];

    const graphIndex = childElements.findIndex((el) => el.tagName === 'graph');
    expect(graphIndex).toBeGreaterThan(-1);

    const keyElements = childElements.filter((el) => el.tagName === 'key');
    expect(keyElements.length).toBeGreaterThan(0);

    for (const keyElement of keyElements) {
      const keyIndex = childElements.indexOf(keyElement);
      expect(keyIndex).toBeLessThan(graphIndex);
    }
  });

  it('defines exactly one key for every data reference', () => {
    const keyIds = Array.from(xml.getElementsByTagName('key')).map((key) =>
      key.getAttribute('id'),
    );

    expect(new Set(keyIds).size).toBe(keyIds.length);
    for (const dataElement of Array.from(xml.getElementsByTagName('data'))) {
      const keyId = dataElement.getAttribute('key');
      expect(keyIds.filter((id) => id === keyId)).toHaveLength(1);
    }
  });

  it('encodes boolean variables correctly as true/false', () => {
    const booleanKeys = Array.from(xml.getElementsByTagName('key')).filter(
      (key) => key.getAttribute('attr.type') === 'boolean',
    );

    expect(booleanKeys.length).toBeGreaterThan(0);

    // For each boolean key, check all data elements that use it
    for (const key of booleanKeys) {
      const keyId = key.getAttribute('id');
      if (!keyId) continue;
      const dataElements = Array.from(xml.getElementsByTagName('data')).filter(
        (data) => data.getAttribute('key') === keyId,
      );

      // check that it is either 'true' or 'false'
      for (const dataElement of dataElements) {
        const textContent = dataElement.textContent;

        if (textContent) {
          expect(['true', 'false']).toContain(textContent);
        }
      }
    }
  });
});
