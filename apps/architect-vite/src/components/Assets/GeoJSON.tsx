import { useEffect, useMemo, useState } from "react";
import type { Column } from "react-table";
import { getAssetById } from "~/utils/assetUtils";
import Table from "./Table";
import withAssetPath from "./withAssetPath";

const ROW_LIMIT = 100;

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
	const text = typeof asset.data === "string" ? asset.data : await asset.data.text();
	return JSON.parse(text) as GeoJSON;
};

const getRows = (geojson: GeoJSON): Record<string, unknown>[] =>
	(geojson.features ?? []).map(({ properties }: GeoJSONFeature) => properties);

const getColumns = (geojson: GeoJSON): Column<Record<string, unknown>>[] => {
	const properties = (geojson.features ?? []).map((feature: GeoJSONFeature) => feature.properties);

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

	const allRows = useMemo(() => getRows(content), [content]);
	const columns = useMemo(() => getColumns(content), [content]);
	const data = useMemo(() => allRows.slice(0, ROW_LIMIT), [allRows]);
	const totalRows = allRows.length;
	const isTruncated = totalRows > ROW_LIMIT;

	return (
		<>
			{isTruncated && (
				<p className="text-sm text-muted-foreground mb-2">
					Showing {ROW_LIMIT} of {totalRows.toLocaleString()} features
				</p>
			)}
			<Table data={data} columns={columns} />
		</>
	);
};

export default withAssetPath(GeoJSONTable as React.ComponentType<unknown>);
