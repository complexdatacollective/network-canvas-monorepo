import type React from "react";
import { compose, withState } from "react-recompose";
import Button from "~/lib/legacy-ui/components/Button";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
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

	return (
		<div className={cx("form-field form-field-container relative block", className)}>
			{label && <h4 className="h3">{label}</h4>}
			{invalid && touched && (
				<div className="flex items-center px-(--space-xs) py-(--space-sm) text-error [&_.icon]:mr-(--space-sm) [&_.icon]:size-(--space-md)">
					<Icon name="warning" />
					{error}
				</div>
			)}
			<div className={cx("relative overflow-hidden", value ? "block" : "hidden")}>{children?.(value)}</div>
			<div className="mt-(--space-md)">
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
