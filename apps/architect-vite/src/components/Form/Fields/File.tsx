import cx from "classnames";
import type React from "react";
import { withState } from "recompose";
import Button from "~/lib/legacy-ui/components/Button";
import Icon from "~/lib/legacy-ui/components/Icon";
import AssetBrowserWindow from "../../AssetBrowser/AssetBrowserWindow";

const withShowBrowser = withState("showBrowser", "setShowBrowser", ({ showBrowser }) => !!showBrowser);

type InputProps = {
	value: string;
	onChange: (value: string) => void;
};

type MetaProps = {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
};

export type FileInputProps = {
	setShowBrowser: (show: boolean) => void;
	onCloseBrowser?: () => void;
	input: InputProps;
	meta: MetaProps;
	showBrowser: boolean;
	label?: string;
	type?: string;
	selected?: string;
	className?: string;
	children?: (id: string) => React.ReactNode;
};

const FileInput = ({
	setShowBrowser,
	onCloseBrowser = () => {},
	input: { value, onChange },
	meta: { error, invalid, touched },
	showBrowser,
	label,
	type,
	selected,
	className,
	children,
}: FileInputProps) => {
	const closeBrowser = () => {
		setShowBrowser(false);
		onCloseBrowser();
	};

	const openBrowser = () => {
		setShowBrowser(true);
	};

	const handleBrowseLibrary = (e: React.MouseEvent) => {
		e.stopPropagation();
		openBrowser();
	};

	const handleBlurBrowser = () => {
		closeBrowser();
	};

	const handleSelectAsset = (assetId: string) => {
		closeBrowser();
		onChange(assetId);
	};

	const fieldClasses = cx("form-fields-file", className, "form-field-container", {
		"form-fields-file--replace": !!value,
		"form-fields-file--has-error": error,
	});

	return (
		<div className={fieldClasses}>
			{label && <h4 className="form-field-label">{label}</h4>}
			{invalid && touched && (
				<div className="form-fields-file__error">
					<Icon name="warning" />
					{error}
				</div>
			)}
			<div className="form-fields-file__preview">{children(value)}</div>
			<div className="form-fields-file__browse">
				<Button onClick={handleBrowseLibrary} color="sea-green">
					{!value ? "Select resource" : "Update resource"}
				</Button>
			</div>
			<AssetBrowserWindow
				show={showBrowser}
				type={type}
				selected={selected}
				onSelect={handleSelectAsset}
				onCancel={handleBlurBrowser}
			/>
		</div>
	);
};

export { FileInput };

export default withShowBrowser(FileInput);
