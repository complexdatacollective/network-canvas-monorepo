import cx from "classnames";
import type React from "react";
import { compose, withState } from "recompose";
import Button from "~/lib/legacy-ui/components/Button";
import Icon from "~/lib/legacy-ui/components/Icon";
import AssetBrowserWindow from "../../AssetBrowser/AssetBrowserWindow";

type InputProps = {
	value: string;
	onChange: (value: string) => void;
};

type MetaProps = {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
};

// Props injected by withState HOC
type InjectedStateProps = {
	showBrowser: boolean;
	setShowBrowser: (show: boolean) => void;
};

// Props that the user passes to the component
export type FileInputPropsWithoutHOC = {
	input: InputProps;
	meta: MetaProps;
	showBrowser?: boolean;
	onCloseBrowser?: () => void;
	label?: string;
	type?: string;
	selected?: string;
	className?: string;
	children?: (id: string) => React.ReactNode;
};

// Full props that the internal component receives (original + injected)
export type FileInputProps = FileInputPropsWithoutHOC & InjectedStateProps;

const withShowBrowser = withState<FileInputPropsWithoutHOC, boolean, "showBrowser", "setShowBrowser">(
	"showBrowser",
	"setShowBrowser",
	({ showBrowser }) => !!showBrowser,
);

const FileInput = ({
	setShowBrowser,
	input: { value, onChange },
	meta: { error, invalid, touched },
	showBrowser,
	onCloseBrowser,
	label,
	type,
	selected,
	className,
	children,
}: FileInputProps) => {
	const closeBrowser = () => {
		setShowBrowser(false);
		onCloseBrowser?.();
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
			<div className="form-fields-file__preview">{children?.(value)}</div>
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

export default compose<FileInputProps, FileInputPropsWithoutHOC>(withShowBrowser)(FileInput);
