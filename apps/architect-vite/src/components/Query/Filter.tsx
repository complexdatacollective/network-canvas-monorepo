import Rules from "./Rules";

type FilterProps = {
	onChange: (value: any) => void;
	openDialog: (dialog: any) => void;
	rules?: any[];
	codebook: Record<string, any>;
	join?: string;
	error?: string;
};

const Filter = ({ rules = [], join = null, codebook, onChange, openDialog, error = null }: FilterProps) => (
	<Rules rules={rules} join={join} onChange={onChange} openDialog={openDialog} codebook={codebook} error={error} />
);


export { Filter };

export default Filter;
