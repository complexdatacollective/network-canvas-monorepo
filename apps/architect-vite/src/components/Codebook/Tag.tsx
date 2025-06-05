type TagProps = {
	children?: React.ReactNode;
	notUsed?: boolean;
};

const Tag = ({ children = null, notUsed = false }: TagProps) => {
	const classes = notUsed ? "codebook__tag codebook__tag--not-used" : "codebook__tag";
	return <div className={classes}>{children}</div>;
};

export default Tag;
