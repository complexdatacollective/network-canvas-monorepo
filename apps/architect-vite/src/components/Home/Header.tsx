import { Menu, X } from "lucide-react";
import { useState } from "react";
import architectIcon from "~/images/Arc-Flat.svg";
import { IconButton } from "~/lib/legacy-ui/components/Button";
import { appVersion } from "~/utils/appVersion";
import Badge from "../Badge";

type NavLinkProps = {
	href: string;
	onClick?: () => void;
	children: React.ReactNode;
};

const NavLink = ({ href, onClick, children }: NavLinkProps) => (
	<a
		href={href}
		target="_blank"
		rel="noopener noreferrer"
		onClick={onClick}
		className="small-heading hover:text-primary underline decoration-2 underline-offset-8 decoration-transparent hover:decoration-(--color-action) transition-all"
	>
		{children}
	</a>
);

const NAV_LINKS = [
	{ href: "https://documentation.networkcanvas.com", label: "Docs" },
	{ href: "https://community.networkcanvas.com", label: "Community" },
	{ href: "https://github.com/complexdatacollective", label: "Github" },
];

const Header = () => {
	const [menuOpen, setMenuOpen] = useState(false);

	const closeMenu = () => setMenuOpen(false);

	return (
		<header className="relative flex justify-between sm:gap-8 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
			<div className="flex items-center gap-3 sm:gap-4 pl-2 sm:pl-3 pr-4 sm:pr-8 py-2 bg-surface-1 rounded-full shadow-sm">
				<img src={architectIcon} alt="Architect" className="h-10 w-10 sm:h-14 sm:w-14" />
				<h3>Architect</h3>
				<Badge color="sea-green">WEB</Badge>
			</div>

			<div className="flex items-center gap-6 lg:gap-12">
				<nav className="hidden md:flex items-center gap-6 lg:gap-10">
					{NAV_LINKS.map(({ href, label }) => (
						<NavLink key={href} href={href}>
							{label}
						</NavLink>
					))}
				</nav>

				<Badge color="white" className="hidden sm:inline-flex">
					<span className="h-2 w-2 rounded-full bg-active" />v{appVersion}
				</Badge>

				<IconButton
					onClick={() => setMenuOpen((open) => !open)}
					aria-label={menuOpen ? "Close menu" : "Open menu"}
					aria-expanded={menuOpen}
					color="white"
					icon={menuOpen ? <X /> : <Menu />}
					className="md:hidden shadow-sm"
				/>
			</div>

			{menuOpen && (
				<nav className="md:hidden absolute top-full left-4 right-4 mt-2 z-[var(--z-panel)] flex flex-col gap-4 bg-surface-1 rounded-2xl shadow-md p-6">
					{NAV_LINKS.map(({ href, label }) => (
						<NavLink key={href} href={href} onClick={closeMenu}>
							{label}
						</NavLink>
					))}
				</nav>
			)}
		</header>
	);
};

export default Header;
