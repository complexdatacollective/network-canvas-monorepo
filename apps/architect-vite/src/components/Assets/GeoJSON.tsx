import { get } from "lodash";
import { useEffect, useMemo, useState } from "react";
import Table from "./Table";
import withAssetPath from "./withAssetPath";

const initialContent = {
	geojson: { features: [] },
	columns: [],
};

const getGeoJSON = (assetPath) => fs.readJson(assetPath);

const getRows = (geojson) => get(geojson, ["features"], []).map(({ properties }) => properties);

const getColumns = (geojson) => {
	const properties = get(geojson, ["features"], []).map((feature) => feature.properties);

	const columnNames = Array.from(new Set(properties.flatMap(Object.keys)));

	return columnNames.map((col) => ({
		Header: col,
		accessor: col,
	}));
};

type GeoJSONTableProps = {
	assetPath: string;
};

const GeoJSONTable = ({ assetPath }: GeoJSONTableProps) => {
	const [content, setContent] = useState({ ...initialContent });

	useEffect(() => {
		if (!assetPath) {
			setContent({ ...initialContent });
			return;
		}

		getGeoJSON(assetPath).then(setContent);
	}, [assetPath]);

	const data = useMemo(() => getRows(content), [content]);
	const columns = useMemo(() => getColumns(content), [content]);

	return <Table data={data} columns={columns} />;
};


export default withAssetPath(GeoJSONTable);
