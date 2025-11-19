/* eslint-disable react/jsx-props-no-spreading */
import { getVariableNamesFromNetwork } from "@codaco/protocol-validation";
import { compose } from "@reduxjs/toolkit";
import { get } from "es-toolkit/compat";
import { useEffect, useMemo, useState } from "react";
import { networkReader } from "../../utils/protocols/assetTools";
import Table from "./Table";
import withAssetPath from "./withAssetPath";

const initialContent = {
	network: { nodes: [] },
	columns: [],
};

type NetworkNode = {
	attributes: Record<string, unknown>;
};

type NetworkData = {
	nodes: NetworkNode[];
};

const getRows = (network: NetworkData): Record<string, unknown>[] =>
	get(network, ["nodes"], []).map(({ attributes }: NetworkNode) => attributes);

const getColumns = (network: NetworkData) =>
	getVariableNamesFromNetwork(network).map((col) => ({
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

		networkReader(assetName, assetId).then(setContent);
	}, [assetId, assetName]);

	const data = useMemo(() => getRows(content), [content]);
	const columns = useMemo(() => getColumns(content), [content]);

	return <Table data={data} columns={columns} />;
};

export default compose(withAssetPath)(Network as React.ComponentType<unknown>);
