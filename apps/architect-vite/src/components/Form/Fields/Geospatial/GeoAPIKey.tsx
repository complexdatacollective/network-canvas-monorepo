import cx from "classnames";
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
	const fieldClasses = cx("form-fields-file", {
		"form-fields-file--replace": !!value,
	});
	return (
		<>
			<div className={fieldClasses}>
				<div className="form-fields-file__preview">{value && <APIKeyThumbnail id={value} />}</div>
				<div className="form-fields-file__browse">
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
