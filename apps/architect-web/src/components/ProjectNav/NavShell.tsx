import type React from "react";
import Brand from "~/components/Brand";
import { useReturnToStartDialog } from "~/hooks/useReturnToStartDialog";
import { cn } from "~/utils/cn";

export const NAV_SURFACE = "pointer-events-auto bg-fresco-purple text-fresco-purple-foreground shadow-lg";

type NavShellProps = {
	leading?: React.ReactNode;
	trailing?: React.ReactNode;
};

const NavShell = ({ leading, trailing }: NavShellProps) => {
	const handleReturnToStart = useReturnToStartDialog();
	return (
		<header className="sticky top-0 z-(--z-global-ui) w-full px-4 sm:px-6 py-(--space-md) pointer-events-none print:hidden print:static">
			<div
				className={cn(
					NAV_SURFACE,
					"max-w-7xl mx-auto rounded-full pl-2 sm:pl-3 pr-6 sm:pr-10 py-3 flex items-center gap-(--space-md) flex-wrap",
				)}
			>
				<div className="flex items-center gap-(--space-md) min-w-0 flex-1 justify-start">
					<Brand variant="icon" onClick={handleReturnToStart} />
					{leading}
				</div>
				{trailing && <div className="flex items-center gap-(--space-md) shrink-0">{trailing}</div>}
			</div>
		</header>
	);
};

export default NavShell;
