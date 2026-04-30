import type { Codebook } from "@codaco/protocol-validation";
import type { ExportOptions } from "../../options";
import type { ExportFileNetwork } from "../../session/exportFile";
import GraphMLFormatter from "./GraphMLFormatter";

const encoder = new TextEncoder();

export async function* graphmlBytes(
	network: ExportFileNetwork,
	codebook: Codebook,
	exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
	const formatter = new GraphMLFormatter(network, codebook, exportOptions);
	const xml = formatter.writeToString();
	yield encoder.encode(xml);
}
