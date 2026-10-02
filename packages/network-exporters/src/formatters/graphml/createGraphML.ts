import { XMLSerializer } from '@xmldom/xmldom';

import type { Codebook } from '@codaco/protocol-validation';
import {
  caseProperty,
  ncTypeProperty,
  protocolName,
  sessionProperty,
} from '@codaco/shared-consts';

import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import type { ExportFileNetwork } from '../../session/exportFile';
import getDataElementGenerator from './generateDataElements';
import getKeyElementGenerator from './generateKeyElements';
import { caseIdAttribute, protocolNameAttribute, setUpXml } from './helpers';
import { scrubXmlDocument } from './xmlScrub';

type ProtocolTextChange = Pick<
  Extract<ExportWarning, { kind: 'xml-illegal-characters-in-protocol' }>,
  'text' | 'original'
>;

/**
 * Generator function to supply XML content in chunks to both string and stream producers
 * @param {*} network
 * @param {*} codebook
 * @param {*} exportOptions
 * @param {*} reportWarning called with each change the export made to what it was given
 */
async function graphMLGenerator(
  network: ExportFileNetwork,
  codebook: Codebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): Promise<string> {
  const xmlDoc = setUpXml(network.sessionVariables);

  const generateKeyElements = getKeyElementGenerator(codebook, exportOptions);

  // <graphml /> is where <key /> elements are attached
  const graphMLElement = xmlDoc.getElementsByTagName('graphml')[0];

  // <graph /> is where <data />, <node />, and <edge /> elements are attached
  const graphElement = xmlDoc.getElementsByTagName('graph')[0];

  if (!graphMLElement || !graphElement) {
    throw new Error('GraphML document missing expected root elements');
  }

  const {
    fragment: keyElements,
    keyIds,
    variableKeyNames,
    renamedColumns,
  } = await generateKeyElements({
    ego: [network.ego],
    node: network.nodes,
    edge: network.edges,
  });
  graphMLElement.insertBefore(keyElements, graphElement);

  const protocolNameText = network.sessionVariables[protocolName];
  for (const renamed of renamedColumns) {
    reportWarning({
      kind: 'column-renamed',
      protocolName: protocolNameText,
      format: 'graphml',
      ...renamed,
    });
  }

  const generateDataElements = getDataElementGenerator(
    codebook,
    exportOptions,
    keyIds,
  );
  graphElement.appendChild(generateDataElements(network.ego));
  graphElement.appendChild(generateDataElements(network.nodes));
  graphElement.appendChild(generateDataElements(network.edges));

  // Characters XML 1.0 cannot hold would make the whole file unreadable. A
  // change to what a participant or researcher entered is reported per
  // interview, a change to the protocol's own text once for the protocol.
  // Everything else written here is generated, and cannot hold them.
  const changedVariables = new Set<string>();
  let caseIdChanged = false;
  const changedProtocolText = new Map<string, ProtocolTextChange>();
  const protocolTextChanged = (change: ProtocolTextChange) =>
    changedProtocolText.set(JSON.stringify(change), change);
  scrubXmlDocument(xmlDoc, ({ element, attribute, original }) => {
    if (element === graphElement && attribute === caseIdAttribute) {
      caseIdChanged = true;
    } else if (
      element === graphElement &&
      attribute === protocolNameAttribute
    ) {
      protocolTextChanged({ text: 'protocol-name', original });
    } else if (element.tagName === 'desc' && attribute === null) {
      protocolTextChanged({ text: 'column-name', original });
    } else if (element.tagName === 'data' && attribute === null) {
      const key = element.getAttribute('key') ?? '';
      const name = variableKeyNames.get(key);
      if (name !== undefined) {
        changedVariables.add(name);
      } else if (key === ncTypeProperty) {
        protocolTextChanged({
          text:
            element.parentElement?.tagName === 'edge'
              ? 'edge-type-name'
              : 'node-type-name',
          original,
        });
      }
    }
  });
  if (caseIdChanged || changedVariables.size > 0) {
    reportWarning({
      kind: 'xml-illegal-characters',
      sessionId: network.sessionVariables[sessionProperty],
      caseId: network.sessionVariables[caseProperty],
      variables: [...changedVariables],
      caseIdChanged,
    });
  }
  for (const change of changedProtocolText.values()) {
    reportWarning({
      kind: 'xml-illegal-characters-in-protocol',
      protocolName: protocolNameText,
      ...change,
    });
  }

  // Serialize the XML document
  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

export default graphMLGenerator;
