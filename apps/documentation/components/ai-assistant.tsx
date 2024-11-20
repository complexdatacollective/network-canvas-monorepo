"use client";

import {
	Dialog,
	DialogContentEmpty,
	DialogTrigger,
	Paragraph,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
	dialogContentClasses,
} from "@codaco/ui";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { env } from "~/env";
import { cn } from "~/lib/utils";

const MendableSearch = dynamic(() => import("@mendable/search").then((modules) => modules.MendableInPlace), {
	ssr: false,
	loading: () => null,
});

const TriggerButton = () => {
	const ref = useRef<HTMLDivElement>(null);
	const t = useTranslations("AIAssistant");

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				ref.current?.click();
			}
		};
		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild={true}>
					<motion.div
						ref={ref}
						tabIndex={0}
						className={cn(
							"flex h-16 w-16 flex-col items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl",
							"sm:h-24 sm:w-24",
						)}
						whileHover={{ scale: 1.1 }}
						whileTap={{ scale: 0.9 }}
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						transition={{ type: "spring" }}
					>
						<span className="text-xl sm:text-2xl">🤖</span>
					</motion.div>
				</TooltipTrigger>
				<TooltipContent className="bg-accent text-accent-foreground">
					<Paragraph variant="smallText">
						{t("popupText")}

						<kbd className="pointer-events-none ml-4 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground opacity-100">
							<span className="text-sm">⌘</span>J
						</kbd>
					</Paragraph>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

const AIAssistant = () => {
	const t = useTranslations("AIAssistant");

	return (
		<Dialog>
			<DialogTrigger className="focusable fixed bottom-6 right-6 z-10">
				<TriggerButton />
			</DialogTrigger>
			<DialogContentEmpty>
				<div className={cn(dialogContentClasses)}>
					<MendableSearch
						style={{ darkMode: false, accentColor: "#5259eb" }}
						anon_key={env.NEXT_PUBLIC_MENDABLE_ANON_KEY}
						hintText={t("dialogPlaceholder")}
						messageSettings={{
							prettySources: true,
							openSourcesInNewTab: false,
						}}
						hintQuestions={[t("q1"), t("q2")]}
						welcomeMessage={t("welcomeMessage")}
					/>
				</div>
			</DialogContentEmpty>
		</Dialog>
	);
};

export default AIAssistant;
