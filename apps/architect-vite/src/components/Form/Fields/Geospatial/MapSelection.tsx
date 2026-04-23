import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
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
		name?: string;
		value: MapValue;
		onChange: (value: MapValue) => void;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string;
	fieldLabel?: string;
	hint?: React.ReactNode;
	required?: boolean;
};

const MapSelection = ({
	input: { name, value, onChange },
	meta = {},
	label,
	fieldLabel,
	hint,
	required,
}: MapSelectionProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;
	const [showMap, setShowMap] = useState(false);

	const { error, invalid, touched } = meta;
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

	const anyLabel = fieldLabel ?? label ?? undefined;

	return (
		<BaseField
			id={id}
			name={name}
			label={anyLabel}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
		>
			<Button onClick={() => setShowMap(true)} color="sea-green">
				{value.center ? "Edit Map View" : "Set Map View"}
			</Button>

			{showMap &&
				createPortal(<MapView mapOptions={value} onChange={onChange} close={() => setShowMap(false)} />, document.body)}
		</BaseField>
	);
};

export default MapSelection;
