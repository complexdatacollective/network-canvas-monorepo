import { withProps } from "recompose";

type PropsWithDataSource = {
	dataSource?: string;
};

const withDisabledAssetRequired = withProps<{ disabled: boolean }, PropsWithDataSource>(({ dataSource }) => ({
	disabled: !dataSource,
}));

export default withDisabledAssetRequired;
