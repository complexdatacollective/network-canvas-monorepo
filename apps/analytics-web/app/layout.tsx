import { ClerkProvider } from "@clerk/nextjs";
import "@codaco/tailwind-config/globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Fresco Analytics ",
	description: "This is the analytics dashboard for Fresco.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ClerkProvider afterSignOutUrl="/">
			<html lang="en">
				<body className={inter.className}>{children}</body>
			</html>
		</ClerkProvider>
	);
}
