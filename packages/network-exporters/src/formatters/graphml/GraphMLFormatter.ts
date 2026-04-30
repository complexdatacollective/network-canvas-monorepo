import type { Codebook } from "@codaco/protocol-validation";
import type { ExportOptions } from "../../options";
import type { ExportFileNetwork } from "../../session/exportFile";
import graphMLGenerator from "./createGraphML";

class GraphMLFormatter {
	network: ExportFileNetwork;
	codebook: Codebook;
	exportOptions: ExportOptions;

	constructor(network: ExportFileNetwork, codebook: Codebook, exportOptions: ExportOptions) {
		this.network = network;
		this.codebook = codebook;
		this.exportOptions = exportOptions;
	}

	writeToString(): Promise<string> {
		return graphMLGenerator(this.network, this.codebook, this.exportOptions);
	}
}

export default GraphMLFormatter;
