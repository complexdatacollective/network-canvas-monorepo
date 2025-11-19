import { get } from "lodash";
import { useEffect, useMemo, useState } from "react";
import type { Column } from "react-table";
import { getAssetById } from "~/utils/assetUtils";
import Table from "./Table";
import withAssetPath from "./withAssetPath";

const initialContent = {
	geojson: { features: [] },
	columns: [],
};

type GeoJSONFeature = {
	properties: Record<string, unknown>;
};

type GeoJSON = {
	features: GeoJSONFeature[];
};

const getGeoJSON = async (assetId: string): Promise<GeoJSON> => {
	const asset = await getAssetById(assetId);
	if (!asset) {
		return { features: [] };
	}
	const text = await asset.data.text();
	return JSON.parse(text) as GeoJSON;
};

const getRows = (geojson: GeoJSON): Record<string, unknown>[] =>
	get(geojson, ["features"], []).map(({ properties }: GeoJSONFeature) => properties);

const getColumns = (geojson: GeoJSON): Column<Record<string, unknown>>[] => {
	const properties = get(geojson, ["features"], []).map((feature: GeoJSONFeature) => feature.properties);

	const columnNames = Array.from(new Set(properties.flatMap(Object.keys)));

	return columnNames.map((col) => ({
		Header: col,
		accessor: col,
	}));
};

type GeoJSONTableProps = {
	assetPath: string;
	assetId: string;
};

const GeoJSONTable = ({ assetId }: GeoJSONTableProps) => {
	const [content, setContent] = useState<GeoJSON>({ features: [] });

	useEffect(() => {
		if (!assetId) {
			setContent({ features: [] });
			return;
		}

		getGeoJSON(assetId).then(setContent);
	}, [assetId]);

	const data = useMemo(() => getRows(content), [content]);
	const columns = useMemo(() => getColumns(content), [content]);

	return <Table data={data} columns={columns} />;
};

export default withAssetPath(GeoJSONTable as React.ComponentType<unknown>);
