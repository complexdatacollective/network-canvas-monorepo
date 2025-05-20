"use client";

import { inputVariants } from "@codaco/ui";
import "@docsearch/css";
import { DocSearch } from "@docsearch/react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { env } from "~/env";
import { cn } from "~/lib/utils";

const DocSearchComponent = ({ className, large }: { className?: string; large?: boolean }) => {
	const locale = useLocale();
	const t = useTranslations("DocSearch");

	// This is honestly some of the biggest bullshit I've ever had to deal with.
	// Algolia - fix your shit.
	const madHax = () => {
		const element = document.getElementsByClassName("DocSearch-Button")[0] as HTMLButtonElement;

		if (element) {
			element.click();
		}
	};

	return (
		<>
			<button
				type="button"
				className={cn(
					inputVariants({ size: large ? "2xl" : "default" }),
					"pointer-events-auto flex w-full items-center justify-between px-4",
					// 'md:w-auto',
					className,
				)}
				onClick={madHax}
				aria-label={t("button.buttonAriaLabel")}
			>
				<span className="flex items-center">
					<Search className={cn("adornment-left mr-2 md:mr-0 lg:mr-2", large && "!mr-4")} />
					<span className="hidden sm:inline md:hidden lg:inline">{t("button.buttonText")}</span>
					<span className="sm:hidden">{t("button.buttonTextMobile")}</span>
				</span>

				<kbd
					className={cn(
						"pointer-events-none ml-4 hidden  h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground opacity-100",
						"sm:inline-flex",
						large && "!h-6",
					)}
				>
					<span className="text-sm">⌘</span>K
				</kbd>
			</button>
			<div className="hidden">
				<DocSearch
					translations={{
						button: {
							buttonText: t("button.buttonText"),
							buttonAriaLabel: t("button.buttonAriaLabel"),
						},
						modal: {
							searchBox: {
								resetButtonTitle: t("modal.searchBox.resetButtonTitle"),
								resetButtonAriaLabel: t("modal.searchBox.resetButtonAriaLabel"),
								cancelButtonText: t("modal.searchBox.cancelButtonText"),
								cancelButtonAriaLabel: t("modal.searchBox.cancelButtonAriaLabel"),
							},
							startScreen: {
								recentSearchesTitle: t("modal.startScreen.recentSearchesTitle"),
								noRecentSearchesText: t("modal.startScreen.noRecentSearchesText"),
								saveRecentSearchButtonTitle: t("modal.startScreen.saveRecentSearchButtonTitle"),
								removeRecentSearchButtonTitle: t("modal.startScreen.removeRecentSearchButtonTitle"),
								favoriteSearchesTitle: t("modal.startScreen.favoriteSearchesTitle"),
								removeFavoriteSearchButtonTitle: t("modal.startScreen.removeFavoriteSearchButtonTitle"),
							},
							errorScreen: {
								titleText: t("modal.errorScreen.titleText"),
								helpText: t("modal.errorScreen.helpText"),
							},
							footer: {
								selectText: t("modal.footer.selectText"),
								selectKeyAriaLabel: t("modal.footer.selectKeyAriaLabel"),
								navigateText: t("modal.footer.navigateText"),
								navigateUpKeyAriaLabel: t("modal.footer.navigateUpKeyAriaLabel"),
								navigateDownKeyAriaLabel: t("modal.footer.navigateDownKeyAriaLabel"),
								closeText: t("modal.footer.closeText"),
								closeKeyAriaLabel: t("modal.footer.closeKeyAriaLabel"),
								searchByText: t("modal.footer.searchByText"),
							},
							noResultsScreen: {
								noResultsText: t("modal.noResultsScreen.noResultsText"),
								suggestedQueryText: t("modal.noResultsScreen.suggestedQueryText"),
								reportMissingResultsText: t("modal.noResultsScreen.reportMissingResultsText"),
								reportMissingResultsLinkText: t("modal.noResultsScreen.reportMissingResultsLinkText"),
							},
						},
					}}
					appId={env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID}
					indexName={env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME}
					apiKey={env.NEXT_PUBLIC_ALGOLIA_API_KEY}
					insights={true}
					placeholder="Search documentation"
					searchParameters={{
						filters: `lang:${locale}`,
					}}
				/>
			</div>
		</>
	);
};

export default DocSearchComponent;
