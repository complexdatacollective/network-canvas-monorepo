import type React from "react";
import ProjectNav from "~/components/ProjectNav/ProjectNav";
import { cx } from "~/utils/cva";

type ProjectLayoutProps = {
	children: React.ReactNode;
	className?: string;
	extraActions?: React.ReactNode;
};

const ProjectLayout = ({ children, className, extraActions }: ProjectLayoutProps) => (
	<div className={cx("relative h-dvh overflow-y-auto pb-32 print:h-auto print:overflow-visible print:pb-0", className)}>
		<ProjectNav extraActions={extraActions} />
		{children}
	</div>
);

export default ProjectLayout;
