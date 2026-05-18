import { useState } from "react";
import APIKeyThumbnail from "~/components/Thumbnail/APIKey";
import Button from "~/lib/legacy-ui/components/Button";
import APIKeyBrowser from "./APIKeyBrowser";

type GeoAPIKeyProps = {
	input: {
		value: string;
		onChange: (value: string) => void;
	};
};

const GeoAPIKey = ({ input: { value, onChange } }: GeoAPIKeyProps) => {
	const [showAPIKeyBrowser, setShowAPIKeyBrowser] = useState(false);
	return (
		<>
			<div className="flex flex-col items-start gap-(--space-md)">
				{value && <APIKeyThumbnail id={value} />}
				<Button onClick={() => setShowAPIKeyBrowser(true)} color="sea-green">
					{!value ? "Select API Key" : "Update API Key"}
				</Button>
			</div>
			<APIKeyBrowser
				show={showAPIKeyBrowser}
				close={() => setShowAPIKeyBrowser(false)}
				onSelect={(keyId) => {
					onChange(keyId); // add the keyId as the value for mapOptions.tokenAssetId
				}}
				selected={value}
			/>
		</>
	);
};

export default GeoAPIKey;
