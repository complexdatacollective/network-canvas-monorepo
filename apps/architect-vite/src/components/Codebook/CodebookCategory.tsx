type CodebookCategoryProps = {
	title?: string;
	children?: React.ReactNode;
};

const CodebookCategory = ({ title = "", children = null }: CodebookCategoryProps) => (
	<div>
		<h2>{title}</h2>
		<div className="border-t-[0.2rem] border-divider mt-(--space-lg)">{children}</div>
	</div>
);

export default CodebookCategory;
