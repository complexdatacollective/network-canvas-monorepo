import { mapboxStyleOptions } from "~/components/Form/Fields/Geospatial/mapboxConstants";
import AssetBadge from "../AssetBadge";
import MiniTable from "../MiniTable";

const mapboxStyleLabels = Object.fromEntries(mapboxStyleOptions.map(({ value, label }) => [value, label]));

type MapOptionsProps = {
	mapOptions?: {
		tokenAssetId?: string;
		dataSourceAssetId?: string;
		style?: string;
		center?: [number, number];
		initialZoom?: number;
		color?: string;
		targetFeatureProperty?: string;
	} | null;
};

const MapOptions = ({ mapOptions = null }: MapOptionsProps) => {
	if (!mapOptions) {
		return null;
	}

	const { tokenAssetId, dataSourceAssetId, style, center, initialZoom, color, targetFeatureProperty } = mapOptions;

	const styleLabel = style ? (mapboxStyleLabels[style] ?? style) : undefined;
	const centerDisplay = center ? `${center[1].toFixed(4)}, ${center[0].toFixed(4)}` : undefined;

	const configRows: [string, React.ReactNode][] = [];

	if (styleLabel) {
		configRows.push(["Map Style", styleLabel]);
	}
	if (centerDisplay) {
		configRows.push(["Initial Center (lat, lng)", centerDisplay]);
	}
	if (initialZoom !== undefined) {
		configRows.push(["Initial Zoom", String(initialZoom)]);
	}
	if (color) {
		configRows.push(["Selection Color", color]);
	}
	if (targetFeatureProperty) {
		configRows.push(["Target Feature Property", targetFeatureProperty]);
	}

	return (
		<>
			{tokenAssetId && (
				<div className="protocol-summary-stage__data-source">
					<div className="protocol-summary-stage__data-source-content">
						<h2 className="section-heading">Mapbox API Key</h2>
						<AssetBadge id={tokenAssetId} link />
					</div>
				</div>
			)}
			{dataSourceAssetId && (
				<div className="protocol-summary-stage__data-source">
					<div className="protocol-summary-stage__data-source-content">
						<h2 className="section-heading">GeoJSON Data Source</h2>
						<AssetBadge id={dataSourceAssetId} link />
					</div>
				</div>
			)}
			{configRows.length > 0 && <MiniTable rotated rows={configRows} />}
		</>
	);
};

export default MapOptions;
