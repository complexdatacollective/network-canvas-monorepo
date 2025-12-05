import Rules from "./Rules";

type Rule = Record<string, unknown>;

type QueryProps = {
	onChange: (value: unknown) => void;
	openDialog: (dialog: unknown) => void;
	rules?: Rule[];
	codebook: Record<string, unknown>;
	join?: string;
	error?: string;
	meta?: Record<string, unknown>;
};

const Query = ({
	rules = [],
	join = undefined,
	codebook,
	onChange,
	openDialog,
	error = undefined,
	meta = {},
}: QueryProps) => (
	<Rules
		meta={meta}
		rules={rules}
		join={join}
		onChange={onChange}
		openDialog={openDialog}
		codebook={codebook}
		type="query"
		error={error}
	/>
);

export default Query;
