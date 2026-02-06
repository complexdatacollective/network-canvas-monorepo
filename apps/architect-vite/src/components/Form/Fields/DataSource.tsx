import type { ComponentProps } from "react";
import { compose, withState } from "recompose";
import Radio from "~/components/Form/Fields/Radio";
import NetworkThumbnail from "~/components/Thumbnail/Network";
import type { FileInputPropsWithoutHOC } from "./File";
import File from "./File";

type InputProps = {
	value: string;
	onChange: (value: string) => void;
};

type MetaProps = {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
};

type BaseDataSourceProps = {
	input: InputProps;
	canUseExisting?: boolean;
	meta?: MetaProps;
};

type DataSourcePropsWithState = BaseDataSourceProps & {
	setSelectNetworkAsset: (value: boolean) => void;
	selectNetworkAsset: boolean;
};

const withSelectNetworkAsset = withState<BaseDataSourceProps, boolean, "selectNetworkAsset", "setSelectNetworkAsset">(
	"selectNetworkAsset",
	"setSelectNetworkAsset",
	false,
);

const DataSource = (props: DataSourcePropsWithState) => {
	const { input, setSelectNetworkAsset, canUseExisting = false, selectNetworkAsset, meta } = props;

	const handleClickUseExisting = () => {
		if (input.value === "existing") {
			return;
		}
		input.onChange("existing");
	};

	const handleClickUseNetworkAsset = () => {
		setSelectNetworkAsset(true);
	};

	const handleCloseBrowser = () => {
		setSelectNetworkAsset(false);
	};

	const isInterviewNetwork = input.value === "existing";
	const showNetworkAssetInput = selectNetworkAsset || !isInterviewNetwork;

	const existingInput = {
		value: input.value && isInterviewNetwork,
		onChange: handleClickUseExisting,
	};

	const networkAssetInput = {
		value: input.value && !isInterviewNetwork,
		onChange: () => {},
		onClick: handleClickUseNetworkAsset,
	};

	const fileProps: FileInputPropsWithoutHOC = {
		input,
		meta: meta ?? {},
		type: "network",
		selected: input.value,
	};

	return canUseExisting ? (
		<div className="form-field-data-source">
			<div className="form-fields-data-source__option">
				<Radio input={existingInput} label="Use the network from the in-progress interview" />
			</div>
			<div className="form-fields-data-source__option">
				<Radio input={networkAssetInput} label="Use a network data file" />
				{showNetworkAssetInput && (
					<div className="form-fields-data-source__option-file">
						<File {...fileProps} showBrowser={selectNetworkAsset} onCloseBrowser={handleCloseBrowser}>
							{(id: string) => <NetworkThumbnail id={id} />}
						</File>
					</div>
				)}
			</div>
		</div>
	) : (
		<File {...fileProps}>{(id: string) => <NetworkThumbnail id={id} />}</File>
	);
};

export default compose<ComponentProps<typeof DataSource>, typeof DataSource>(withSelectNetworkAsset)(DataSource);
