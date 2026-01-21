import { get } from "es-toolkit/compat";
import type { Map as MapboxMap } from "mapbox-gl";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Layout, Section } from "~/components/EditorLayout";
import Dialog from "~/components/NewComponents/Dialog";
import Button from "~/lib/legacy-ui/components/Button";
import { getAssetManifest } from "~/selectors/protocol";

type MapOptions = {
	center?: number[];
	tokenAssetId?: string;
	initialZoom?: number;
	dataSourceAssetId?: string;
	color?: string;
	targetFeatureProperty?: string;
	style?: string;
};

type MapViewProps = {
	mapOptions?: MapOptions;
	onChange: (options: MapOptions) => void;
	close: () => void;
};

const MapView = ({
	mapOptions = {
		center: [0, 0],
		tokenAssetId: "",
		initialZoom: 0,
		dataSourceAssetId: "",
		color: "",
		targetFeatureProperty: "",
		style: "",
	},
	onChange,
	close,
}: MapViewProps) => {
	const { tokenAssetId, style } = mapOptions;
	const assetManifest = useSelector(getAssetManifest);
	const mapboxAPIKey = tokenAssetId ? get(assetManifest, [tokenAssetId, "value"], "") : "";

	const mapRef = useRef<MapboxMap | null>(null);
	const mapContainerRef = useRef<HTMLDivElement>(null);

	const [center, setCenter] = useState<[number, number]>((mapOptions.center as [number, number]) || [0, 0]);
	const [zoom, setZoom] = useState(mapOptions.initialZoom || 0);
	const [isAnimationComplete, setIsAnimationComplete] = useState(false);

	const saveMapSelection = (newCenter: [number, number], newZoom: number) => {
		onChange({
			...mapOptions,
			center: newCenter,
			initialZoom: newZoom,
		});
	};

	const isMapChanged = center !== mapOptions.center || zoom !== mapOptions.initialZoom;

	useEffect(() => {
		if (!isAnimationComplete || !mapboxAPIKey || !mapContainerRef.current || mapRef.current) {
			return;
		}

		mapboxgl.accessToken = mapboxAPIKey;

		const map = new mapboxgl.Map({
			container: mapContainerRef.current,
			style: style || "mapbox://styles/mapbox/streets-v12",
			center,
			zoom,
		});

		mapRef.current = map;

		map.addControl(
			new mapboxgl.NavigationControl({
				showCompass: false,
			}),
		);

		map.on("move", () => {
			const mapCenter = map.getCenter();
			const mapZoom = map.getZoom();

			setCenter([mapCenter.lng, mapCenter.lat]);
			setZoom(mapZoom);
		});

		return () => {
			map.remove();
			mapRef.current = null;
		};
	}, [isAnimationComplete, mapboxAPIKey, style]);

	const handleAnimationComplete = () => {
		setIsAnimationComplete(true);
	};

	return (
		<Dialog
			open={true}
			onOpenChange={(open) => !open && close()}
			onAnimationComplete={handleAnimationComplete}
			header={<h2 className="m-0">Initial Map View</h2>}
			footer={
				<>
					<Button color="platinum" onClick={close}>
						Cancel
					</Button>
					{isMapChanged && (
						<Button
							color="sea-green"
							onClick={() => {
								saveMapSelection(center, zoom);
								close();
							}}
							iconPosition="right"
							icon="arrow-right"
						>
							Save Changes
						</Button>
					)}
				</>
			}
		>
			<Layout>
				<Section
					title="Set Initial Map View"
					summary={
						<p>
							Pan and zoom the map below to configure the initial view. When the map is first loaded, it will be
							centered at the initial center and zoom level as it appears here. Resetting the map will return it to this
							view.
						</p>
					}
					layout="vertical"
				>
					<div ref={mapContainerRef} style={{ width: "100%", height: "50vh" }} />
				</Section>
			</Layout>
		</Dialog>
	);
};

export default MapView;
