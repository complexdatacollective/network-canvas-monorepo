import { useState } from "react";
import { createPortal } from "react-dom";
import Button from "~/lib/legacy-ui/components/Button";

import MapView from "./MapView";

type MapValue = {
	center?: number[];
	tokenAssetId?: string;
	initialZoom?: number;
	dataSourceAssetId?: string;
	color?: string;
	targetFeatureProperty?: string;
	style?: string;
};

type MapSelectionProps = {
	input: {
		value: MapValue;
		onChange: (value: MapValue) => void;
	};
};

const MapSelection = ({ input: { value, onChange } }: MapSelectionProps) => {
	const [showMap, setShowMap] = useState(false);

	return (
		<>
			<Button onClick={() => setShowMap(true)} color="primary">
				{value.center ? "Edit Map View" : "Set Map View"}
			</Button>

			{showMap &&
				createPortal(<MapView mapOptions={value} onChange={onChange} close={() => setShowMap(false)} />, document.body)}
		</>
	);
};

export default MapSelection;
