import { Readable } from "node:stream";
import type { Codebook } from "@codaco/protocol-validation";
import {
	caseProperty,
	egoProperty,
	entityAttributesProperty,
	entityPrimaryKeyProperty,
	ncCaseProperty,
	ncProtocolNameProperty,
	ncSessionProperty,
	protocolName,
	sessionExportTimeProperty,
	sessionFinishTimeProperty,
	sessionProperty,
	sessionStartTimeProperty,
} from "@codaco/shared-consts";
import type { ExportOptions, SessionWithResequencedIDs } from "../../types";
import { csvEOL, sanitizedCellValue } from "./csv";
import processEntityVariables from "./processEntityVariables";

type NetworkWithUnifiedEgo = SessionWithResequencedIDs & {
	ego: Record<string, SessionWithResequencedIDs["ego"]>;
	sessionVariables: Record<string, SessionWithResequencedIDs["sessionVariables"]>;
};

const asEgoAndSessionVariablesList = (
	network: SessionWithResequencedIDs | NetworkWithUnifiedEgo,
	codebook: Codebook,
	exportOptions: ExportOptions,
) => {
	if (exportOptions.globalOptions.unifyNetworks) {
		const unifiedNetwork = network as NetworkWithUnifiedEgo;
		// If unified networks is enabled, network.ego is an object keyed by sessionID.
		return Object.keys(unifiedNetwork.ego).map((sessionID) => {
			const ego = unifiedNetwork.ego[sessionID] as SessionWithResequencedIDs["ego"];
			const sessionVars = unifiedNetwork.sessionVariables[sessionID] as SessionWithResequencedIDs["sessionVariables"];
			return processEntityVariables(
				{
					...ego,
					...sessionVars,
				} as Parameters<typeof processEntityVariables>[0],
				"ego",
				codebook,
				exportOptions,
			);
		});
	}

	return [
		processEntityVariables(
			{
				...network.ego,
				...network.sessionVariables,
			},
			"ego",
			codebook,
			exportOptions,
		),
	];
};

/**
 * The output of this formatter will contain the primary key (_uid)
 * and all model data (inside the `attributes` property)
 */
const attributeHeaders = (egos: ReturnType<typeof asEgoAndSessionVariablesList>) => {
	const initialHeaderSet = new Set<string>([]);

	// Create initial headers for non-attribute (model) variables such as sessionID
	initialHeaderSet.add(entityPrimaryKeyProperty);
	initialHeaderSet.add(caseProperty);
	initialHeaderSet.add(sessionProperty);
	initialHeaderSet.add(protocolName);
	initialHeaderSet.add(sessionStartTimeProperty);
	initialHeaderSet.add(sessionFinishTimeProperty);
	initialHeaderSet.add(sessionExportTimeProperty);
	initialHeaderSet.add("APP_VERSION");
	initialHeaderSet.add("COMMIT_HASH");

	const headerSet = egos.reduce((headers, ego) => {
		// Add headers for attributes
		for (const key of Object.keys(ego?.[entityAttributesProperty] || {})) {
			headers.add(key);
		}

		return headers;
	}, initialHeaderSet);
	return [...headerSet];
};

const getPrintableAttribute = (attribute: string) => {
	switch (attribute) {
		case caseProperty:
			return ncCaseProperty;
		case sessionProperty:
			return ncSessionProperty;
		case protocolName:
			return ncProtocolNameProperty;
		case entityPrimaryKeyProperty:
			return egoProperty;
		default:
			return attribute;
	}
};

/**
 * @return {Object} an abort controller; call the attached abort() method as needed.
 */
const toCSVStream = (egos: ReturnType<typeof asEgoAndSessionVariablesList>, outStream: NodeJS.WritableStream) => {
	const totalRows = egos.length;
	const attrNames = attributeHeaders(egos);
	let headerWritten = false;
	let rowIndex = 0;
	let rowContent: string;
	let ego: (typeof egos)[number];

	const inStream = new Readable({
		read(/* size */) {
			if (!headerWritten) {
				this.push(`${attrNames.map((attr) => sanitizedCellValue(getPrintableAttribute(attr))).join(",")}${csvEOL}`);
				headerWritten = true;
			} else if (rowIndex < totalRows) {
				ego = egos[rowIndex] || ({} as (typeof egos)[number]);
				const values = attrNames.map((attrName) => {
					// Session variables exist at the top level - all others inside `attributes`
					let value: unknown;
					if (
						attrName === entityPrimaryKeyProperty ||
						attrName === caseProperty ||
						attrName === sessionProperty ||
						attrName === protocolName ||
						attrName === sessionStartTimeProperty ||
						attrName === sessionFinishTimeProperty ||
						attrName === sessionExportTimeProperty ||
						attrName === "APP_VERSION" ||
						attrName === "COMMIT_HASH"
					) {
						value = (ego as Record<string, unknown>)[attrName];
					} else {
						value = (ego[entityAttributesProperty] as Record<string, unknown>)?.[attrName];
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

class EgoListFormatter {
	list: ReturnType<typeof asEgoAndSessionVariablesList>;

	constructor(
		network: SessionWithResequencedIDs | NetworkWithUnifiedEgo,
		codebook: Codebook,
		exportOptions: ExportOptions,
	) {
		this.list = asEgoAndSessionVariablesList(network, codebook, exportOptions) || [];
	}

	writeToStream(outStream: NodeJS.WritableStream) {
		return toCSVStream(this.list, outStream);
	}
}

export { asEgoAndSessionVariablesList, EgoListFormatter, toCSVStream };
