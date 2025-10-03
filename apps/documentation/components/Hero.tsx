"use client";

import { Paragraph } from "@codaco/ui";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cn } from "~/lib/utils";
import DocSearchComponent from "./DocSearchComponent";
import FancyHeading from "./FancyHeading";
import FancyParagraph from "./FancyParagraph";

function ProjectCard({
	href,
	title,
	description,
	icon,
}: {
	href: string;
	title: string;
	description: string;
	icon: string;
}) {
	return (
		<Link href={href} className="basis-1/2">
			<div
				className={cn(
					"flex h-full cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xl transition-colors md:p-6",
					"hover:border-accent hover:bg-accent hover:text-accent-foreground",
				)}
			>
				<div className="flex shrink-0 items-center gap-4">
					<img src={icon} className="h-16 w-auto" alt={title} />
					<FancyHeading variant="h2" margin="none">
						{title}
					</FancyHeading>
				</div>
				<Paragraph>{description}</Paragraph>
			</div>
		</Link>
	);
}

export function Hero() {
	const t = useTranslations();
	return (
		<>
			<motion.div
				className="mx-4 flex max-w-5xl flex-col items-center gap-10 sm:mx-8 md:-mt-8 md:flex-1 md:justify-center lg:gap-16"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
			>
				<div className="flex flex-col-reverse items-center justify-center text-center md:flex-row md:justify-start md:text-left">
					<div className="basis-auto items-center justify-center md:flex md:basis-1/2 lg:basis-2/5">
						<motion.div
							initial={{ opacity: 1, y: 0, scale: 1 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							transition={{
								type: "spring",
								stiffness: 80,
								delay: 0.25,
							}}
						>
							<svg
								className="h-auto w-full stroke-[currentColor] fill-[currentColor] stroke-2"
								viewBox="0 0 512 512"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<title>Robot</title>
								<use href="images/robot.svg" />
							</svg>
						</motion.div>
					</div>
					<div className="flex flex-col items-center justify-center">
						<FancyHeading variant="h1" className="text-4xl">
							{t("Hero.title")}
						</FancyHeading>
						<FancyParagraph variant="lead">{t("Hero.tagline")}</FancyParagraph>
						<DocSearchComponent className="hidden !w-full text-base lg:inline-flex" large />
					</div>
				</div>
				<div className="flex flex-col gap-6 md:flex-row">
					<ProjectCard
						href="en/desktop"
						title={t("ProjectSwitcher.desktop.label")}
						description={t("ProjectSwitcher.desktop.description")}
						icon="images/desktop.png"
					/>
					<ProjectCard
						href="en/fresco"
						title={t("ProjectSwitcher.fresco.label")}
						description={t("ProjectSwitcher.fresco.description")}
						icon="images/fresco.png"
					/>
				</div>
			</motion.div>
		</>
	);
}
