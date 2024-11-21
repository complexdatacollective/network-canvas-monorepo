import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "~/app/types";
import Article from "~/components/article";
import { getDocumentForPath } from "~/lib/docs";

type PageProps = { params: Promise<{ locale: Locale; project: string }> };

export default async function Page(props: PageProps) {
	const params = await props.params;
	const { locale, project } = params;

	// setting setRequestLocale to support next-intl for static rendering
	setRequestLocale(params.locale);

	const document = await getDocumentForPath({
		locale,
		project,
	});

	if (document === null) notFound();

	return (
		<Article
			content={document.component}
			title={document.frontmatter.title}
			headings={document.headings}
			showToc={document.frontmatter.toc && document.headings.length > 0}
			wip={document.frontmatter.wip}
		/>
	);
}
