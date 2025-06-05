import Button from "@codaco/legacy-ui/components/Button";
import { useState } from "react";
import { createPortal } from "react-dom";

import MapView from "./MapView";

type MapSelectionProps = {
	input: {
		value: {
			center?: number[];
			tokenAssetId?: string;
			initialZoom?: number;
			dataSourceAssetId?: string;
			color?: string;
			targetFeatureProperty?: string;
			style?: string;
		};
		onChange: (value: any) => void;
	};
};

const MapSelection = ({ input: { value, onChange } }: MapSelectionProps) => {
	const [showMap, setShowMap] = useState(false);

	return (
		<>
			<Button onClick={() => setShowMap(true)} color="primary" size="small">
				{value.center ? "Edit Map View" : "Set Map View"}
			</Button>

			{showMap &&
				createPortal(<MapView mapOptions={value} onChange={onChange} close={() => setShowMap(false)} />, document.body)}
		</>
	);
};

export default MapSelection;
