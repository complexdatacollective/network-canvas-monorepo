import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getAvailableLocalesForPath } from "~/lib/docs";

type InnerLanguageSwitcherProps = {
	pathSegment: string[];
	currentLocale: string;
	project: string;
};

const InnerLanguageSwitcher = async ({ pathSegment, currentLocale, project }: InnerLanguageSwitcherProps) => {
	const t = await getTranslations("DocPage");
	const availableLocales = getAvailableLocalesForPath(project, pathSegment);
	const filePath = `/${project}/${pathSegment.join("/")}`; //document file path to navigate to

	// removes the current locale from availableLocales
	const supportedLanguages = availableLocales.filter((locale) => locale !== currentLocale);

	if (!supportedLanguages.length) return null;

	return (
		<div className="my-1 flex gap-2">
			<span>{t("docAvailableTxt")}</span>
			{supportedLanguages.map((lang) => (
				<div key={lang}>
					<Link className="text-blue-400 hover:text-cyan-400 mx-1 transition-colors" href={`/${lang}${filePath}`}>
						{lang}
					</Link>
				</div>
			))}
		</div>
	);
};

export default InnerLanguageSwitcher;
