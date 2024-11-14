"use client";

import { Heading, Paragraph, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@codaco/ui";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { forwardRef } from "react";
import { type Locale, type ProjectsEnum, projects } from "~/app/types";
import { cn } from "~/lib/utils";
import { useRouter } from "~/navigation";

const getImageForProject = (project: ProjectsEnum) => {
	if (project === "desktop") {
		return <img src="/images/desktop.png" alt={project} className="h-10 w-auto" />;
	}

	if (project === "fresco") {
		return <img src="/images/fresco.png" alt={project} className="h-10 w-auto" />;
	}
};

const ProjectValue = forwardRef<
	HTMLDivElement,
	{
		project: ProjectsEnum;
		showDescription?: boolean;
	}
>(({ project, showDescription }, ref) => {
	const t = useTranslations("ProjectSwitcher");
	return (
		<div className="flex flex-1 items-center" ref={ref}>
			<div className={cn("mr-2 flex items-center justify-start", showDescription && "min-w-[75px]")}>
				{getImageForProject(project)}
			</div>
			<div className="flex flex-col">
				<Heading variant="h4" margin={showDescription ? "default" : "none"}>
					{t(`${project}.label`)}
				</Heading>
				{showDescription && (
					<Paragraph className="max-w-[20rem] max-[450px]:max-w-[12rem] sm:max-w-full" variant="smallText">
						{t(`${project}.description`)}
					</Paragraph>
				)}
			</div>
		</div>
	);
});

ProjectValue.displayName = "ProjectValue";

export default function ProjectSwitcher() {
	const router = useRouter();
	const pathname = usePathname();
	// biome-ignore lint/style/noNonNullAssertion: path structure is known
	const project = pathname.split("/")[2]! as ProjectsEnum;
	const locale = useLocale() as Locale;

	return (
		<Select
			value={project}
			onValueChange={(val) => {
				router.push(`/${val}`, { locale });
			}}
		>
			<SelectTrigger className="my-4 h-16">
				<ProjectValue project={project} />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{projects.map((p) => (
						<SelectItem key={p} value={p} className="sm:w-[25rem]">
							<ProjectValue project={p} showDescription />
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
