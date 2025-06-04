import Rules from "./Rules";

type QueryProps = {
	onChange: (value: any) => void;
	openDialog: (dialog: any) => void;
	rules?: any[];
	codebook: Record<string, any>;
	join?: string;
	error?: string;
	meta?: Record<string, any>;
};

const Query = ({ rules = [], join = null, codebook, onChange, openDialog, error = null, meta = {} }: QueryProps) => (
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


export { Query };

export default Query;
