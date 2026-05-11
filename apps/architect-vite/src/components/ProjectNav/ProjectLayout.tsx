import type React from "react";
import ProjectNav from "~/components/ProjectNav/ProjectNav";
import { cn } from "~/utils/cn";
import { PageActionsProvider } from "./PageActions";

type ProjectLayoutProps = {
	children: React.ReactNode;
	className?: string;
};

const ProjectLayout = ({ children, className }: ProjectLayoutProps) => (
	<PageActionsProvider>
		<div className={cn("relative h-dvh overflow-y-auto print:h-auto print:overflow-visible", className)}>
			<ProjectNav />
			{children}
		</div>
	</PageActionsProvider>
);

export default ProjectLayout;
