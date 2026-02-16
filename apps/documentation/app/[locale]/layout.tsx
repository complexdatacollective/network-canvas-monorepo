import "@fontsource-variable/quicksand";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getNow, getTimeZone, setRequestLocale } from "next-intl/server";
import type { Messages } from "~/app/types";
import { locales } from "~/app/types";
import AIAssistant from "~/components/ai-assistant";
import { LayoutComponent } from "~/components/Layout";
import { PostHogClientProvider } from "~/components/Providers/posthog-provider";
import { ThemeProvider } from "~/components/Providers/theme-provider";
import { env } from "~/env";
import { routing } from "~/lib/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params;

	const metadata: Metadata = {
		other: {
			"docsearch:language": locale,
			"docsearch:version": "1.0.1",
		},
	};

	return metadata;
}

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

type MainLayoutProps = {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
};

export default async function MainLayout(props: MainLayoutProps) {
	const { children } = props;

	// Validate that the incoming `locale` parameter is valid
	const { locale } = await props.params;
	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}

	// setting setRequestLocale to support next-intl for static rendering
	setRequestLocale(locale);

	const now = await getNow({ locale });
	const timeZone = await getTimeZone({ locale });

	let messages: { default: Messages };

	try {
		messages = (await import(`../../messages/${locale}.json`)) as {
			default: Messages;
		};
	} catch (_e) {
		notFound();
	}

	return (
		<html lang={locale} suppressHydrationWarning className="font-sans antialiased">
			<body className="flex min-h-[100dvh] flex-col text-base">
				<PostHogClientProvider>
					<ThemeProvider enableSystem enableColorScheme attribute="class" storageKey="nc-docs-site">
						<NextIntlClientProvider timeZone={timeZone} now={now} locale={locale} messages={messages.default}>
							<LayoutComponent>{children}</LayoutComponent>
							<AIAssistant />
						</NextIntlClientProvider>
					</ThemeProvider>
				</PostHogClientProvider>
			</body>
			<GoogleAnalytics gaId={env.NEXT_PUBLIC_GA_ID} />
			<Analytics />
		</html>
	);
}
