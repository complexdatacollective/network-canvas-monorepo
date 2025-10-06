import { Heading, Paragraph, buttonVariants, headingVariants } from "@codaco/ui";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { ArrowLeftCircle, ChevronDown } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { cn } from "~/lib/utils";

type BaseMenu = {
	translationKey: string;
	style?: "button";
};

type MenuWithHref = BaseMenu & {
	href: Route;
	menu?: undefined;
};

type MenuWithSubMenu = BaseMenu & {
	menu: SubMenu;
	href?: undefined;
};

type SubMenu = {
	titleTranslationKey: string;
	descriptionTranslationKey: string;
	href: Route;
	image: string;
}[];

type MenuItem = MenuWithHref | MenuWithSubMenu;

const links: MenuItem[] = [
	{
		translationKey: "community",
		href: "https://community.networkcanvas.com",
	},
	{
		translationKey: "documentation",
		href: "/",
	},
	{
		translationKey: "projects",
		menu: [
			{
				titleTranslationKey: "projectsChildren.partner-services.label",
				descriptionTranslationKey: "projectsChildren.partner-services.description",
				href: "https://partnerservices.networkcanvas.com",
				image: "/images/projects/partner-services.jpg",
			},
			{
				titleTranslationKey: "projectsChildren.fresco.label",
				descriptionTranslationKey: "projectsChildren.fresco.description",
				href: "https://github.com/complexdatacollective/Fresco",
				image: "/images/fresco.svg",
			},
			{
				titleTranslationKey: "projectsChildren.studio.label",
				descriptionTranslationKey: "projectsChildren.studio.description",
				href: "https://github.com/complexdatacollective/Studio",
				image: "/images/studio.svg",
			},
		],
	},
	{
		translationKey: "download",
		style: "button",
		href: "https://networkcanvas.com/download",
	},
];

const linkClasses = cn(
	headingVariants({ variant: "h4-all-caps", margin: "none" }),
	"focusable flex items-center underline-offset-8 hover:text-success",
);

export const NavigationMenuDemo = () => {
	const t = useTranslations("SharedNavigation");

	return (
		<NavigationMenu.Root asChild>
			<div className={cn("relative z-10 hidden grow justify-end", "md:flex")}>
				<NavigationMenu.List className="center m-0 flex list-none items-center gap-6 lg:gap-10">
					{links.map((link, _i) => {
						if (link.menu) {
							return (
								<NavigationMenu.Item key={link.translationKey}>
									<NavigationMenu.Trigger className={cn(linkClasses, "gap-2")}>
										{t(link.translationKey)} <ChevronDown className="h-4 w-4" aria-hidden />
									</NavigationMenu.Trigger>
									<NavigationMenu.Content className="absolute right-0 top-0 w-full">
										<ul className="m-0 grid w-full grid-cols-3 gap-4 p-6">
											{link.menu.map((subLink, _i) => (
												<li key={subLink.titleTranslationKey} className="col-span-1 grid">
													<NavigationMenu.Link asChild>
														<a
															className={cn(
																"flex h-full w-full select-none flex-col justify-end rounded-md bg-accent p-4 text-accent-foreground no-underline outline-none",
																"focusable",
															)}
															href={subLink.href}
														>
															<Heading variant="label">{t(subLink.titleTranslationKey)}</Heading>
															<Paragraph variant="smallText">{t(subLink.descriptionTranslationKey)}</Paragraph>
														</a>
													</NavigationMenu.Link>
												</li>
											))}
										</ul>
									</NavigationMenu.Content>
								</NavigationMenu.Item>
							);
						}

						if (link.style === "button") {
							return (
								<NavigationMenu.Item key={link.translationKey}>
									<NavigationMenu.Link
										href={link.href}
										className={buttonVariants({
											variant: "default",
											size: "sm",
										})}
									>
										{t(link.translationKey)}
									</NavigationMenu.Link>
								</NavigationMenu.Item>
							);
						}

						return (
							<NavigationMenu.Item key={link.translationKey}>
								<NavigationMenu.Link className={linkClasses} href={link.href}>
									{t(link.translationKey)}
								</NavigationMenu.Link>
							</NavigationMenu.Item>
						);
					})}
					<NavigationMenu.Indicator className="data-[state=visible]:animate-fadeIn data-[state=hidden]:animate-fadeOut top-full z-[1] flex h-[10px] items-end justify-center overflow-hidden transition-[width,transform_250ms_ease]">
						<div className="relative top-[70%] h-[14px] w-[14px] rotate-[45deg] rounded-tl-[2px] bg-card" />
					</NavigationMenu.Indicator>
				</NavigationMenu.List>

				<div className="perspective-[2000px] absolute right-0 top-full flex justify-center">
					<NavigationMenu.Viewport className="data-[state=open]:animate-scaleIn data-[state=closed]:animate-scaleOut relative mt-[10px] h-[var(--radix-navigation-menu-viewport-height)] w-[calc(100vw-20rem)] origin-[top_center] overflow-hidden rounded-[6px] bg-card shadow-xl transition-[width,_height] duration-300 lg:w-[50rem]" />
				</div>
			</div>
		</NavigationMenu.Root>
	);
};

export const NavigationMenuMobile = () => {
	const t = useTranslations("SharedNavigation");
	const [submenu, setSubmenu] = useState<SubMenu>([]);

	if (!submenu.length) {
		return (
			<ul className={"flex flex-col items-center justify-center gap-4 md:hidden"}>
				{links.map((link, _i) => {
					if (link.style === "button" && link.href) {
						return (
							<li key={link.translationKey}>
								<Link
									className={buttonVariants({
										variant: "default",
										size: "sm",
									})}
									href={link.href}
								>
									{t(link.translationKey)}
								</Link>
							</li>
						);
					}

					if (link.menu) {
						return (
							<li key={link.translationKey}>
								<button type="button" className={linkClasses} onClick={() => setSubmenu(link.menu)}>
									{t(link.translationKey)}
								</button>
							</li>
						);
					}

					return (
						<li key={link.translationKey}>
							<Link className={linkClasses} href={link.href}>
								{t(link.translationKey)}
							</Link>
						</li>
					);
				})}
			</ul>
		);
	}

	return (
		<ul className={"flex flex-col items-center justify-center gap-4"}>
			{submenu.map((subLink, _i) => (
				<li key={subLink.titleTranslationKey}>
					<Link className={linkClasses} href={subLink.href}>
						{t(subLink.titleTranslationKey)}
					</Link>
				</li>
			))}

			<li>
				<button
					type="button"
					className={cn(buttonVariants({ variant: "accent", size: "sm" }), "inline rounded-full px-2")}
					onClick={() => setSubmenu([])}
				>
					<ArrowLeftCircle className="shrink-0" />
				</button>
			</li>
		</ul>
	);
};
