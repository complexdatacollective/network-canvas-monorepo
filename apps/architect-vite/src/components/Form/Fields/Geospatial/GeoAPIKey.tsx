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
		</>
	);
};

export default GeoAPIKey;
