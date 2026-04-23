import { cx } from "../utils";
import { baseParagraphClasses } from "./Paragraph";

type UnorderedListProps = React.HTMLAttributes<HTMLUListElement> & {
	children: React.ReactNode;
	className?: string;
};

const listContainerClasses = cx("my-5 ml-8 [&>li]:mt-2");

export function UnorderedList({ children, className }: UnorderedListProps) {
	return <ul className={cx(listContainerClasses, "list-disc", className)}>{children}</ul>;
}

type OrderedListProps = React.HTMLAttributes<HTMLOListElement> & {
	children: React.ReactNode;
	className?: string;
};

export function OrderedList({ children, className }: OrderedListProps) {
	return <ol className={cx(listContainerClasses, "list-decimal", className)}>{children}</ol>;
}

type ListItemProps = React.HTMLAttributes<HTMLLIElement> & {
	children: React.ReactNode;
	className?: string;
};

export function ListItem({ children, className }: ListItemProps) {
	return (
		<li className={cx(baseParagraphClasses, "pl-2 [&>ol]:mb-0 [&>ol]:mt-2 [&>ul]:mb-0 [&>ul]:mt-2", className)}>
			{children}
		</li>
	);
}
