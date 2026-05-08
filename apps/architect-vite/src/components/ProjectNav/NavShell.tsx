import type React from "react";
import Brand from "~/components/Brand";
import { useReturnToStartDialog } from "~/hooks/useReturnToStartDialog";

type NavShellProps = {
	leading?: React.ReactNode;
	center?: React.ReactNode;
	trailing: React.ReactNode;
};

const NavShell = ({ leading, center, trailing }: NavShellProps) => {
	const handleReturnToStart = useReturnToStartDialog();
	return (
		<header className="sticky top-0 z-(--z-global-ui) w-full bg-background px-4 sm:px-6 py-(--space-md) print:hidden print:static">
			<div className="max-w-7xl mx-auto bg-accent text-accent-foreground shadow-sm rounded-full pl-2 sm:pl-3 pr-4 sm:pr-5 py-3 flex items-center gap-(--space-md) flex-wrap">
				<div className="flex items-center gap-(--space-md) min-w-0 flex-1 basis-0 justify-start">
					<Brand variant="icon" onClick={handleReturnToStart} />
					{leading}
				</div>
				{center && <div className="flex items-center justify-center shrink-0">{center}</div>}
				<div className="flex items-center gap-(--space-sm) flex-1 basis-0 justify-end">{trailing}</div>
			</div>
		</header>
	);
};

export default NavShell;
