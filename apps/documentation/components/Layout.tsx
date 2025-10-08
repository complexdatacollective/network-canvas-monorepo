"use client";

import { BackgroundBlobs } from "@codaco/art";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Sidebar } from "~/components/Sidebar";
import { cn } from "~/lib/utils";
import SharedNav from "./SharedNav/SharedNav";

export function LayoutComponent({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const locale = useLocale();

	// Check if we are on the home page by comparing the pathname to our supported locals
	const isHomePage = pathname === `/${locale}`;

	return (
		<>
			<SharedNav />
			<motion.div
				className="fixed inset-0 z-[-1]"
				initial={{ opacity: 0 }}
				animate={{ opacity: isHomePage ? 0.15 : 0.05 }}
				transition={{
					duration: isHomePage ? 2 : 0,
				}}
			>
				<BackgroundBlobs
					large={0}
					medium={3}
					small={3}
					// speedFactor={20}
					// filter={isHomePage ? '' : 'blur(10rem)'}
					compositeOperation="screen"
					// compositeOperation="lighten"
				/>
			</motion.div>
			<main className={cn("mt-4 flex h-full w-full flex-auto justify-center")}>
				{!isHomePage && (
					<Sidebar className="mx-4 hidden max-w-80 lg:sticky lg:top-2 lg:flex lg:max-h-[calc(100dvh-1rem)]" />
				)}

				{children}
			</main>
			<footer>
				<div className="mt-10 flex justify-center text-balance py-4 text-sm">
					© {new Date().getFullYear()} Complex Data Collective
				</div>
			</footer>
		</>
	);
}
