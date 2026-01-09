import { ClerkProvider } from "@clerk/nextjs";
import "@codaco/tailwind-config/globals.css";
import "@fontsource-variable/inter";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Fresco Analytics ",
	description: "This is the analytics dashboard for Fresco.",
};

// Force dynamic rendering to avoid static generation issues with Clerk
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<ClerkProvider afterSignOutUrl="/">
			<html lang="en">
				<body className="font-sans">{children}</body>
			</html>
		</ClerkProvider>
	);
}
