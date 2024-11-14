import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@codaco/tailwind-config/globals.css";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

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
		<ClerkProvider>
			<html lang="en">
				<body className={inter.className}>{children}</body>
			</html>
		</ClerkProvider>
	);
}
