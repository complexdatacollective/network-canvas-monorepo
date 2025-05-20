import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "~/app/types";
import Article from "~/components/article";
import { getDocsForRouteSegment, getDocumentForPath } from "~/lib/docs";

type PageParams = {
	locale: Locale;
	project: string;
	docPath: string[];
};

export async function generateMetadata(props: { params: Promise<PageParams> }) {
	const params = await props.params;
	const { locale, project, docPath } = params;
	const document = await getDocumentForPath({
		locale,
		project,
		pathSegment: docPath,
	});

	return { title: document?.frontmatter.title };
}

export function generateStaticParams({ params }: { params: Omit<PageParams, "docPath"> }) {
	const { locale, project } = params;
	const docPathSegmentsForRoute = getDocsForRouteSegment({
		locale,
		project,
	});

	return docPathSegmentsForRoute;
}

export default async function Page(props: { params: Promise<PageParams> }) {
	const params = await props.params;
	const { locale, project, docPath } = params;
	// setting setRequestLocale to support next-intl for static rendering
	setRequestLocale(locale);

	const document = await getDocumentForPath({
		locale,
		project,
		pathSegment: docPath,
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
