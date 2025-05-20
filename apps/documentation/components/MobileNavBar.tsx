import { Button } from "@codaco/ui";
import { X as CloseMenu, Menu as HamburgerMenu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { useState } from "react";
import { cn } from "~/lib/utils";
import DocSearchComponent from "./DocSearchComponent";
import MobileSidebarDialog from "./MobileSidebarDialog";

const MobileNavBar = () => {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();
	const locale = useLocale();

	// Check if we are on the home page by comparing the pathname to our supported locals
	const isHomePage = pathname === `/${locale}`;
	return (
		<>
			<div className="flex shrink grow basis-auto items-center gap-4 lg:hidden">
				<MobileSidebarDialog open={open} setOpen={setOpen} />
				<DocSearchComponent />
				{open ? (
					<Button onClick={() => setOpen(false)} variant="ghost" size="icon-large" className="shrink-0">
						<CloseMenu className="h-8 w-8  transition-transform duration-300" />
					</Button>
				) : (
					<Button
						onClick={() => setOpen(true)}
						variant="ghost"
						size="icon-large"
						className={cn("flex shrink-0 items-center justify-center", isHomePage && "md:hidden")}
					>
						<HamburgerMenu className="h-8 w-8" />
					</Button>
				)}
			</div>
		</>
	);
};

export default MobileNavBar;
