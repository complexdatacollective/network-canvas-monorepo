import Rules from "./Rules";

type Rule = Record<string, unknown>;

type FilterProps = {
	onChange: (value: unknown) => void;
	openDialog: (dialog: unknown) => void;
	rules?: Rule[];
	codebook: Record<string, unknown>;
	join?: string;
	error?: string;
};

const Filter = ({ rules = [], join = undefined, codebook, onChange, openDialog, error = undefined }: FilterProps) => (
	<Rules rules={rules} join={join} onChange={onChange} openDialog={openDialog} codebook={codebook} error={error} />
);

export default Filter;
