import type React from "react";
import { useMemo, useRef } from "react";
import { compose, withState } from "react-recompose";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import Button from "~/lib/legacy-ui/components/Button";
import { cx } from "~/utils/cva";
import AssetBrowserWindow from "../../AssetBrowser/AssetBrowserWindow";

type InputProps = {
	name?: string;
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
	fieldLabel?: string;
	hint?: React.ReactNode;
	required?: boolean;
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
	input,
	meta,
	showBrowser,
	onCloseBrowser,
	label,
	fieldLabel,
	hint,
	required = false,
	type,
	selected,
	className,
	children,
}: FileInputProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;

	const { value, onChange, name } = input;
	const { error, invalid, touched } = meta;
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

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
			<div className={cx("relative block", className)}>
				{value && <div className="relative overflow-hidden">{children?.(value)}</div>}
				<div className="mt-[var(--space-md)]">
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
		</BaseField>
	);
};

export default compose<FileInputProps, FileInputPropsWithoutHOC>(withShowBrowser)(FileInput);
