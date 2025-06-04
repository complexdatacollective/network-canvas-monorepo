import withAssetMeta from "./withAssetMeta";

type APIKeyProps = {
	meta?: {
		value?: string;
		name?: string;
	};
};

const APIKey = ({ meta = { value: "" } }: APIKeyProps) => <h1 style={{ wordWrap: "break-word" }}>{meta.value}</h1>;


export default withAssetMeta(APIKey);
