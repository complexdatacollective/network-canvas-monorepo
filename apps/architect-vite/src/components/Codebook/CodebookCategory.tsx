
type CodebookCategoryProps = {
	title?: string;
	children?: React.ReactNode;
};

const CodebookCategory = ({ title = "", children = null }: CodebookCategoryProps) => (
	<div className="codebook-category">
		<h2>{title}</h2>
		<div className="codebook__category-items">{children}</div>
	</div>
);


export default CodebookCategory;
