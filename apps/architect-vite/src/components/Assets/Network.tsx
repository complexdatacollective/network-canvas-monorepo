/* eslint-disable react/jsx-props-no-spreading */
import { getVariableNamesFromNetwork } from "@codaco/protocol-validation";
import { get } from "es-toolkit/compat";
import { useEffect, useMemo, useState } from "react";
import { compose } from "@reduxjs/toolkit";
import { networkReader } from "../../utils/protocols/assetTools";
import Table from "./Table";
import withAssetPath from "./withAssetPath";

const initialContent = {
	network: { nodes: [] },
	columns: [],
};

const getRows = (network) => get(network, ["nodes"], []).map(({ attributes }) => attributes);

const getColumns = (network) =>
	getVariableNamesFromNetwork(network).map((col) => ({
		Header: col,
		accessor: col,
	}));

type NetworkProps = {
	assetPath: string;
};

const Network = ({ assetPath }: NetworkProps) => {
	const [content, setContent] = useState({ ...initialContent });

	useEffect(() => {
		if (!assetPath) {
			setContent({ ...initialContent });
			return;
		}

		networkReader(assetPath).then(setContent);
	}, [assetPath]);

	const data = useMemo(() => getRows(content), [content]);
	const columns = useMemo(() => getColumns(content), [content]);

	return <Table data={data} columns={columns} />;
};


export default compose(withAssetPath)(Network);
