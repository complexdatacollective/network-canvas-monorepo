/* eslint-disable react/jsx-props-no-spreading */

import { getVariableNamesFromNetwork, type Network as NetworkType } from "@codaco/protocol-validation";
import type { VariableValue } from "@codaco/shared-consts";
import { compose } from "@reduxjs/toolkit";
import { useEffect, useMemo, useState } from "react";
import { networkReader } from "../../utils/protocols/assetTools";
import Table from "./Table";
import withAssetPath from "./withAssetPath";

const ROW_LIMIT = 100;

const initialContent: NetworkType = {
	nodes: [],
	edges: [],
};

type NetworkNode = {
	attributes: Record<string, VariableValue>;
};

const getRows = (data: NetworkType): Record<string, VariableValue>[] =>
	(data.nodes ?? []).map(({ attributes }: NetworkNode) => attributes);

const getColumns = (data: NetworkType) =>
	getVariableNamesFromNetwork(data).map((col) => ({
		Header: col,
		accessor: col,
	}));

type NetworkProps = {
	assetPath: string;
	assetId: string;
	assetName: string;
};

const Network = ({ assetPath: _assetPath, assetId, assetName }: NetworkProps) => {
	const [content, setContent] = useState({ ...initialContent });

	useEffect(() => {
		if (!assetId || !assetName) {
			setContent({ ...initialContent });
			return;
		}

		networkReader(assetName, assetId).then((networkData: Partial<NetworkType>) => {
			// Normalize the data to ensure edges is always present (CSV files only return nodes)
			setContent({
				nodes: networkData?.nodes ?? [],
				edges: networkData?.edges ?? [],
			});
		});
	}, [assetId, assetName]);

	const allRows = useMemo(() => getRows(content), [content]);
	const columns = useMemo(() => getColumns(content), [content]);
	const data = useMemo(() => allRows.slice(0, ROW_LIMIT), [allRows]);
	const totalRows = allRows.length;
	const isTruncated = totalRows > ROW_LIMIT;

	return (
		<>
			{isTruncated && (
				<p className="text-sm text-muted-foreground mb-2">
					Showing {ROW_LIMIT} of {totalRows.toLocaleString()} rows
				</p>
			)}
			<Table data={data} columns={columns} />
		</>
	);
};

export default compose(withAssetPath)(
	Network as unknown as React.ComponentType<unknown>,
) as unknown as React.ComponentType<{ id: string }>;
