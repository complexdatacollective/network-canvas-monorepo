import { Readable } from "node:stream";
import type { Codebook } from "@codaco/protocol-validation";
import {
	egoProperty,
	entityAttributesProperty,
	entityPrimaryKeyProperty,
	ncUUIDProperty,
	nodeExportIDProperty,
} from "@codaco/shared-consts";
import type { ExportOptions, SessionWithResequencedIDs } from "../../types";
import { csvEOL, sanitizedCellValue } from "./csv";
import processEntityVariables from "./processEntityVariables";

const asAttributeList = (network: SessionWithResequencedIDs, codebook: Codebook, exportOptions: ExportOptions) => {
	const processedNodes = (network.nodes || []).map((node) => {
		if (codebook?.node?.[node.type]) {
			return processEntityVariables(node, "node", codebook, exportOptions);
		}
		return node;
	});
	return processedNodes;
};

/**
 * The output of this formatter will contain the primary key (_uid)
 * and all model data (inside the `attributes` property)
 */
const attributeHeaders = (nodes: ReturnType<typeof asAttributeList>) => {
	const initialHeaderSet = new Set<string>([]);
	initialHeaderSet.add(nodeExportIDProperty);
	initialHeaderSet.add(egoProperty);
	initialHeaderSet.add(entityPrimaryKeyProperty);

	const headerSet = nodes.reduce((headers, node) => {
		for (const key of Object.keys(node[entityAttributesProperty])) {
			headers.add(key);
		}
		return headers;
	}, initialHeaderSet);

	return [...headerSet];
};

const getPrintableAttribute = (attribute: string) => {
	switch (attribute) {
		case entityPrimaryKeyProperty:
			return ncUUIDProperty;
		default:
			return attribute;
	}
};

/**
 * @return {Object} an abort controller; call the attached abort() method as needed.
 */
const toCSVStream = (nodes: ReturnType<typeof asAttributeList>, outStream: NodeJS.WritableStream) => {
	const totalRows = nodes.length;
	const attrNames = attributeHeaders(nodes);
	let headerWritten = false;
	let rowIndex = 0;
	let rowContent: string;
	let node: (typeof nodes)[number];

	const inStream = new Readable({
		read(/* size */) {
			if (!headerWritten) {
				const headerValue = `${attrNames
					.map((attr) => sanitizedCellValue(getPrintableAttribute(attr)))
					.join(",")}${csvEOL}`;
				this.push(headerValue);
				headerWritten = true;
			} else if (rowIndex < totalRows) {
				node = nodes[rowIndex] as (typeof nodes)[number];
				const values = attrNames.map((attrName) => {
					// The primary key and ego id exist at the top-level; all others inside `.attributes`
					let value: unknown;
					if (attrName === entityPrimaryKeyProperty || attrName === egoProperty || attrName === nodeExportIDProperty) {
						value = (node as Record<string, unknown>)[attrName];
					} else {
						value = (node[entityAttributesProperty] as Record<string, unknown>)[attrName];
					}
					return sanitizedCellValue(value);
				});
				rowContent = `${values.join(",")}${csvEOL}`;
				this.push(rowContent);
				rowIndex += 1;
			} else {
				this.push(null);
			}
		},
	});

	// TODO: handle teardown. Use pipeline() API in Node 10?
	inStream.pipe(outStream);

	return {
		abort: () => {
			inStream.destroy();
		},
	};
};

class AttributeListFormatter {
	list: ReturnType<typeof asAttributeList>;

	constructor(data: SessionWithResequencedIDs, codebook: Codebook, exportOptions: ExportOptions) {
		this.list = asAttributeList(data, codebook, exportOptions);
	}

	writeToStream(outStream: NodeJS.WritableStream) {
		return toCSVStream(this.list, outStream);
	}
}

export { asAttributeList, AttributeListFormatter, toCSVStream };
