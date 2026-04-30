import type { Codebook, Variable } from "@codaco/protocol-validation";
import {
	caseProperty,
	codebookHashProperty,
	edgeSourceProperty,
	type NcEdge,
	type NcEgo,
	type NcNode,
	protocolName,
	protocolProperty,
	sessionExportTimeProperty,
	sessionFinishTimeProperty,
	sessionProperty,
	sessionStartTimeProperty,
	type VariableValue,
} from "@codaco/shared-consts";
import { DOMImplementation } from "@xmldom/xmldom";
import { isNil } from "es-toolkit";
import type { EdgeWithResequencedID, NodeWithResequencedID } from "../../input";
import type { ExportFileNetwork } from "../../session/exportFile";
import { getEntityAttributes } from "../../utils/general";

export function getCodebookVariablesForEntity(
	entity: NodeWithResequencedID | EdgeWithResequencedID | NcEgo,
	codebook: Codebook,
) {
	const entityType = deriveEntityType(entity);
	// Fetch the codebook variables for this entity
	let codebookVariables: Record<string, Variable>;
	if ("type" in entity) {
		codebookVariables = codebook[entityType as "node" | "edge"]?.[entity.type]?.variables ?? {};
	} else {
		codebookVariables = codebook.ego?.variables ?? {};
	}

	return codebookVariables;
}

export function deriveEntityType(
	entities: NodeWithResequencedID[] | EdgeWithResequencedID[] | NcEgo | NcNode | NcEdge,
) {
	if (!Array.isArray(entities)) {
		return "type" in entities ? (Object.hasOwn(entities, edgeSourceProperty) ? "edge" : "node") : "ego";
	}

	// Handle empty arrays
	if (entities.length === 0) {
		return "node";
	}

	const first = entities[0];
	return first !== undefined && Object.hasOwn(first, edgeSourceProperty) ? "edge" : "node";
}

export function createDocumentFragment() {
	const dom = new DOMImplementation().createDocument(null, "root", null);
	const fragment = dom.createDocumentFragment();

	return fragment;
}

export const setUpXml = (sessionVariables: ExportFileNetwork["sessionVariables"]) => {
	const doc = new DOMImplementation().createDocument(null, "graphml", null);

	// Set the necessary namespaces and attributes
	const root = doc.documentElement;
	if (!root) throw new Error("GraphML document missing root element");
	root.setAttribute("xmlns", "http://graphml.graphdrawing.org/xmlns");
	root.setAttribute("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");
	root.setAttribute(
		"xsi:schemaLocation",
		"http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd",
	);
	root.setAttribute("xmlns:nc", "http://schema.networkcanvas.com/xmlns");

	const pi = doc.createProcessingInstruction("xml", 'version="1.0" encoding="UTF-8"');
	doc.insertBefore(pi, doc.firstChild);

	// Create <key> for a 'label' variable for display in Gephi.
	const labelDataElement = doc.createElement("key");
	labelDataElement.setAttribute("id", "label");
	labelDataElement.setAttribute("attr.name", "label");
	labelDataElement.setAttribute("attr.type", "string");
	labelDataElement.setAttribute("for", "all");
	root.appendChild(labelDataElement);

	// Create the graph element
	const graph = doc.createElement("graph");

	// Add attributes
	graph.setAttribute("edgedefault", "undirected");
	graph.setAttribute("nc:caseId", sessionVariables[caseProperty]);
	graph.setAttribute("nc:sessionUUID", sessionVariables[sessionProperty]);
	graph.setAttribute("nc:protocolName", sessionVariables[protocolName]);
	graph.setAttribute("nc:protocolUID", sessionVariables[protocolProperty]);
	graph.setAttribute("nc:codebookHash", sessionVariables[codebookHashProperty]);
	graph.setAttribute("nc:sessionExportTime", sessionVariables[sessionExportTimeProperty]);

	if (sessionVariables[sessionStartTimeProperty]) {
		graph.setAttribute("nc:sessionStartTime", sessionVariables[sessionStartTimeProperty]);
	}

	if (sessionVariables[sessionFinishTimeProperty]) {
		graph.setAttribute("nc:sessionFinishTime", sessionVariables[sessionFinishTimeProperty]);
	}

	root.appendChild(graph);

	return doc;
};

// Pure-JS SHA-1 keeps the package runtime-agnostic (no `node:crypto`).
// Output matches the hex digest produced by `crypto.createHash("sha1")`.
const utf8Encoder = new TextEncoder();

function rotateLeft(value: number, shift: number): number {
	return (value << shift) | (value >>> (32 - shift));
}

function readWord(w: Uint32Array, index: number): number {
	return w[index] ?? 0;
}

export const sha1 = (text: string): string => {
	const message = utf8Encoder.encode(text);
	const bitLength = message.length * 8;

	// Append 0x80 byte, then zero bytes until length ≡ 56 (mod 64), then 64-bit length.
	const paddedLength = ((message.length + 9 + 63) >> 6) << 6;
	const padded = new Uint8Array(paddedLength);
	padded.set(message);
	padded[message.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
	view.setUint32(paddedLength - 4, bitLength >>> 0);

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;
	let h4 = 0xc3d2e1f0;

	const w = new Uint32Array(80);
	for (let chunk = 0; chunk < paddedLength; chunk += 64) {
		for (let i = 0; i < 16; i++) {
			w[i] = view.getUint32(chunk + i * 4);
		}
		for (let i = 16; i < 80; i++) {
			w[i] = rotateLeft(readWord(w, i - 3) ^ readWord(w, i - 8) ^ readWord(w, i - 14) ^ readWord(w, i - 16), 1);
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;

		for (let i = 0; i < 80; i++) {
			let f: number;
			let k: number;
			if (i < 20) {
				f = (b & c) | (~b & d);
				k = 0x5a827999;
			} else if (i < 40) {
				f = b ^ c ^ d;
				k = 0x6ed9eba1;
			} else if (i < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8f1bbcdc;
			} else {
				f = b ^ c ^ d;
				k = 0xca62c1d6;
			}

			const temp = (rotateLeft(a, 5) + f + e + k + readWord(w, i)) >>> 0;
			e = d;
			d = c;
			c = rotateLeft(b, 30);
			b = a;
			a = temp;
		}

		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
	}

	const toHex = (value: number) => value.toString(16).padStart(8, "0");
	return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
};

/**
 * For a given key, return a valid Graphml data 'type' for encoding
 * Graphml types are extended from xs:NMTOKEN:
 *   - boolean
 *   - int
 *   - long
 *   - float
 *   - double
 *   - string
 *
 * @param {*} data
 * @param {*} key
 */

type GraphMLKeyType = "boolean" | "int" | "long" | "float" | "double" | "string";

export const getGraphMLTypeForKey = (
	data: NodeWithResequencedID[] | EdgeWithResequencedID[] | NcEgo[],
	key: string,
): GraphMLKeyType =>
	data.reduce<GraphMLKeyType | null>((result, value) => {
		const attrs = getEntityAttributes(value);

		// If the attribute is not present, return the current result
		if (isNil(attrs[key])) return result;

		const currentType = getAttributeType(attrs[key]);

		// If we haven't yet set a type, set it to whatever we detected the type as
		if (result === null) return currentType;

		// If types match, keep that type
		if (currentType === result) return currentType;

		// Always upgrade to a higher precision number type - never downgrade
		if (currentType === "double" && result === "int") return "double";
		if (currentType === "int" && result === "double") return "double";

		// Default to string when types don't match
		return "string";
	}, null) ?? "string"; // Default to string if no values are processed

function getAttributeType(attribute: VariableValue): GraphMLKeyType {
	// Determine the type of the attribute value
	if (typeof attribute === "boolean") {
		return "boolean";
	}

	if (typeof attribute === "number") {
		// For numbers, check if integer or floating point
		return Number.isInteger(attribute) ? "int" : "double";
	}

	// Handle string representation of numbers
	// Handle potential object values before stringifying
	const attrVal = attribute;
	const attrStr = typeof attrVal === "object" && attrVal !== null ? JSON.stringify(attrVal) : String(attrVal);

	// Integer pattern
	if (/^-?\d+$/.exec(attrStr)) {
		return "int";
	}

	// Float pattern
	if (/^-?\d+\.\d+$/.exec(attrStr)) {
		return "double";
	}

	return "string";
}

export const createDataElement = (attributes: Record<string, string>, text: string) => {
	const dom = new DOMImplementation().createDocument(null, "root", null);
	const textNode = dom.createTextNode(text);
	const element = dom.createElement("data");
	Object.entries(attributes).forEach(([key, val]) => {
		element.setAttribute(key, val);
	});

	element.appendChild(textNode);

	return element;
};
