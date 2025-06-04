import cx from "classnames";

type LayoutProps = {
	children: React.ReactNode;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const Layout = ({ children, className = "", ...rest }: LayoutProps) => {
	const containerClasses = cx(className, "stage-editor");

	return (
		<div
			className={containerClasses}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...rest}
		>
			{children}
		</div>
	);
};


export default Layout;
