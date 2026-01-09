import "@fontsource-variable/quicksand";
import { Divider, Heading, ListItem, Paragraph, UnorderedList } from "@codaco/ui";

import Link from "~/components/Link";
import { ThemeProvider } from "~/components/Providers/theme-provider";

export default function NotFound() {
	return (
		<html lang="en" className="font-sans antialiased">
			<ThemeProvider attribute="class" enableSystem enableColorScheme storageKey="nc-docs-site">
				<body className="flex h-screen items-center justify-center">
					<div className="max-w-lg p-3 sm:p-0">
						<Heading variant="h1">404 - Not found</Heading>
						<Divider />
						<Heading variant="h2">The requested page could not be found.</Heading>
						<Paragraph>
							This is most likely to have happened because the page has been moved or deleted. We apologize for any
							inconvenience this has caused.
						</Paragraph>
						<Paragraph>Please try the following:</Paragraph>
						<UnorderedList>
							<ListItem>
								If you typed the page address in the address bar, make sure that it is spelled correctly.
							</ListItem>
							<ListItem>
								Use the &apos;return home&apos; link below to navigate to the home page, and then navigate to the page
								you are looking for using the menus.
							</ListItem>
							<ListItem>
								Contact the project team if you believe you are seeing this page in error, including details of the page
								you were trying to reach. Please email us at{" "}
								<Link href="mailto:info@networkcanvas.com">info@networkcanvas.com</Link>.
							</ListItem>
						</UnorderedList>
						<Link href="/">Return Home</Link>
					</div>
				</body>
			</ThemeProvider>
		</html>
	);
}
