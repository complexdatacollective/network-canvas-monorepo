import { useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import APIKeyThumbnail from "~/components/Thumbnail/APIKey";
import Button from "~/lib/legacy-ui/components/Button";
import APIKeyBrowser from "./APIKeyBrowser";

type GeoAPIKeyProps = {
	input: {
		name?: string;
		value: string;
		onChange: (value: string) => void;
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

const GeoAPIKey = ({
	input: { name, value, onChange },
	meta = {},
	label,
	fieldLabel,
	hint,
	required,
}: GeoAPIKeyProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;
	const [showAPIKeyBrowser, setShowAPIKeyBrowser] = useState(false);

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
			<div className="relative block">
				{value && (
					<div className="relative overflow-hidden">
						<APIKeyThumbnail id={value} />
					</div>
				)}
				<div className="mt-[var(--space-md)]">
					<Button onClick={() => setShowAPIKeyBrowser(true)} color="sea-green">
						{!value ? "Select API Key" : "Update API Key"}
					</Button>
				</div>
			</div>
			<APIKeyBrowser
				show={showAPIKeyBrowser}
				close={() => setShowAPIKeyBrowser(false)}
				onSelect={(keyId) => {
					onChange(keyId); // add the keyId as the value for mapOptions.tokenAssetId
				}}
				selected={value}
			/>
		</BaseField>
	);
};

export default GeoAPIKey;
