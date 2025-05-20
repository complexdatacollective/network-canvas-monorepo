import { Button } from "@codaco/ui";
import { X as CloseMenu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { NavigationMenuMobile } from "~/components/SharedNav/Menu";
import { Sheet, SheetContent } from "~/components/ui/sheet";
import LogoComponent from "./SharedNav/LogoComponent";
import { Sidebar } from "./Sidebar";

type MobileSidebarDialogProps = {
	open: boolean;
	setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function MobileSidebarDialog({ open, setOpen }: MobileSidebarDialogProps) {
	const pathname = usePathname();
	const locale = useLocale();

	// Check if we are on the home page by comparing the pathname to our supported locals
	const isHomePage = pathname === `/${locale}`;

	// biome-ignore lint/correctness/useExhaustiveDependencies: close when the path changes
	useEffect(() => {
		setOpen(false);
	}, [pathname, setOpen]);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex h-[100vh] w-full flex-col overflow-y-auto bg-background px-4 py-0" side={"left"}>
				<div className="sticky top-0 z-10 flex items-center justify-between bg-background">
					<LogoComponent className="mx-4 my-2 block w-fit" />
					<Button
						size={"sm"}
						onClick={() => setOpen(false)}
						variant="ghost"
						className="flex h-10 w-10 items-center justify-center gap-2 rounded-full sm:hidden"
					>
						<CloseMenu className="h-4 w-4 shrink-0" />
					</Button>
				</div>

				<NavigationMenuMobile />
				{!isHomePage && <Sidebar />}
			</SheetContent>
		</Sheet>
	);
}
