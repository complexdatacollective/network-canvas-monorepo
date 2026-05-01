import type { Codebook } from "@codaco/protocol-validation";
import { XMLSerializer } from "@xmldom/xmldom";
import type { ExportOptions } from "../../options";
import type { ExportFileNetwork } from "../../session/exportFile";
import getDataElementGenerator from "./generateDataElements";
import getKeyElementGenerator from "./generateKeyElements";
import { setUpXml } from "./helpers";

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
	const generateDataElements = getDataElementGenerator(codebook, exportOptions);

	// <graphml /> is where <key /> elements are attached
	const graphMLElement = xmlDoc.getElementsByTagName("graphml")[0];

	// <graph /> is where <data />, <node />, and <edge /> elements are attached
	const graphElement = xmlDoc.getElementsByTagName("graph")[0];

	if (!graphMLElement || !graphElement) {
		throw new Error("GraphML document missing expected root elements");
	}

	if (network.ego) {
		const [egoKeys, egoData] = await Promise.all([generateKeyElements(network.ego), generateDataElements(network.ego)]);
		graphMLElement.insertBefore(egoKeys, graphElement);
		graphElement.appendChild(egoData);
	}

	const [nodeKeys, nodeData, edgeKeys, edgeData] = await Promise.all([
		generateKeyElements(network.nodes),
		generateDataElements(network.nodes),
		generateKeyElements(network.edges),
		generateDataElements(network.edges),
	]);

	graphMLElement.insertBefore(nodeKeys, graphElement);
	graphElement.appendChild(nodeData);

	graphMLElement.insertBefore(edgeKeys, graphElement);
	graphElement.appendChild(edgeData);

	// Serialize the XML document
	const serializer = new XMLSerializer();
	return serializer.serializeToString(xmlDoc);
}

export default graphMLGenerator;
