import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/globals.css";
import { ORPCProvider } from "../providers/orpc-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Fresco Platform - Deploy Your Own Network Canvas Instance",
	description: "Self-service platform for deploying isolated Network Canvas Fresco instances",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className={inter.className}>
				<ORPCProvider>{children}</ORPCProvider>
			</body>
		</html>
	);
}
