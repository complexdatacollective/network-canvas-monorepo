import type { ReactNode } from "react";
import "@codaco/tailwind-config/globals.css";
import "~/styles/globals.css";
import "~/styles/tokyo-night-dark.css";

type Props = {
	children: ReactNode;
};

// Since we have a `not-found.tsx` page on the root, a layout file
// is required, even if it's just passing children through.
export default function RootLayout({ children }: Props) {
	return children;
}
