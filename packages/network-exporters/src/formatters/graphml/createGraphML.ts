import { XMLSerializer } from '@xmldom/xmldom';

import type { Codebook } from '@codaco/protocol-validation';
import { caseProperty, sessionProperty } from '@codaco/shared-consts';

import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import type { ExportFileNetwork } from '../../session/exportFile';
import getDataElementGenerator from './generateDataElements';
import getKeyElementGenerator from './generateKeyElements';
import { caseIdAttribute, setUpXml } from './helpers';
import { scrubXmlDocument } from './xmlScrub';

/**
 * Generator function to supply XML content in chunks to both string and stream producers
 * @param {*} network
 * @param {*} codebook
 * @param {*} exportOptions
 * @param {*} reportWarning called when answers lost characters XML cannot hold
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
  } = await generateKeyElements({
    ego: [network.ego],
    node: network.nodes,
    edge: network.edges,
  });
  graphMLElement.insertBefore(keyElements, graphElement);

  const generateDataElements = getDataElementGenerator(
    codebook,
    exportOptions,
    keyIds,
  );
  const [egoData, nodeData, edgeData] = await Promise.all([
    generateDataElements(network.ego),
    generateDataElements(network.nodes),
    generateDataElements(network.edges),
  ]);

  graphElement.appendChild(egoData);
  graphElement.appendChild(nodeData);
  graphElement.appendChild(edgeData);

  // Characters XML 1.0 cannot hold would make the whole file unreadable.
  // Protocol-authored text (names, the protocol's name) is cleaned silently;
  // a change to what a participant or researcher entered is reported.
  const changedVariables = new Set<string>();
  let caseIdChanged = false;
  scrubXmlDocument(xmlDoc, ({ element, attribute }) => {
    if (element === graphElement && attribute === caseIdAttribute) {
      caseIdChanged = true;
    } else if (element.tagName === 'data' && attribute === null) {
      const name = variableKeyNames.get(element.getAttribute('key') ?? '');
      if (name !== undefined) changedVariables.add(name);
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

  // Serialize the XML document
  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

export default graphMLGenerator;
