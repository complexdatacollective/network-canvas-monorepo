import { XMLSerializer } from '@xmldom/xmldom';

import type { Codebook } from '@codaco/protocol-validation';

import type { ExportOptions } from '../../options';
import type { ExportFileNetwork } from '../../session/exportFile';
import getDataElementGenerator from './generateDataElements';
import getKeyElementGenerator from './generateKeyElements';
import { setUpXml } from './helpers';

/**
 * Generator function to supply XML content in chunks to both string and stream producers
 * @param {*} network
 * @param {*} codebook
 * @param {*} exportOptions
 */
async function graphMLGenerator(
  network: ExportFileNetwork,
  codebook: Codebook,
  exportOptions: ExportOptions,
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

  const { fragment: keyElements, externalKeyIds } = await generateKeyElements({
    ego: [network.ego],
    node: network.nodes,
    edge: network.edges,
  });
  graphMLElement.insertBefore(keyElements, graphElement);

  const generateDataElements = getDataElementGenerator(
    codebook,
    exportOptions,
    externalKeyIds,
  );
  const [egoData, nodeData, edgeData] = await Promise.all([
    generateDataElements(network.ego),
    generateDataElements(network.nodes),
    generateDataElements(network.edges),
  ]);

  graphElement.appendChild(egoData);
  graphElement.appendChild(nodeData);
  graphElement.appendChild(edgeData);

  // Serialize the XML document
  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

export default graphMLGenerator;
