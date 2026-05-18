import {
  Content,
  Indicator,
  Item,
  List,
  Link as NavigationMenuLink,
  Root,
  Trigger,
  Viewport,
} from '@radix-ui/react-navigation-menu';
import { ArrowLeftCircle, ChevronDown } from 'lucide-react';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

import { buttonVariants } from '~/components/ui/Button';
import Heading, { headingVariants } from '~/components/ui/typography/Heading';
import Paragraph from '~/components/ui/typography/Paragraph';
import { cn } from '~/lib/utils';

type BaseMenu = {
  translationKey: string;
  style?: 'button';
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
    translationKey: 'community',
    href: 'https://community.networkcanvas.com',
  },
  {
    translationKey: 'documentation',
    href: '/',
  },
  {
    translationKey: 'projects',
    menu: [
      {
        titleTranslationKey: 'projectsChildren.partner-services.label',
        descriptionTranslationKey:
          'projectsChildren.partner-services.description',
        href: 'https://partnerservices.networkcanvas.com',
        image: '/images/projects/partner-services.jpg',
      },
      {
        titleTranslationKey: 'projectsChildren.fresco.label',
        descriptionTranslationKey: 'projectsChildren.fresco.description',
        href: 'https://github.com/complexdatacollective/Fresco',
        image: '/images/fresco.svg',
      },
      {
        titleTranslationKey: 'projectsChildren.studio.label',
        descriptionTranslationKey: 'projectsChildren.studio.description',
        href: 'https://github.com/complexdatacollective/Studio',
        image: '/images/studio.svg',
      },
    ],
  },
  {
    translationKey: 'download',
    style: 'button',
    href: 'https://networkcanvas.com/download',
  },
];

const linkClasses = cn(
  headingVariants({ variant: 'h4-all-caps', margin: 'none' }),
  'focusable hover:text-success flex items-center underline-offset-8',
);

export const NavigationMenuDemo = () => {
  const t = useTranslations('SharedNavigation');

  return (
    <Root asChild>
      <div className={cn('relative z-10 hidden grow justify-end', 'md:flex')}>
        <List className="center m-0 flex list-none items-center gap-6 lg:gap-10">
          {links.map((link, _i) => {
            if (link.menu) {
              return (
                <Item key={link.translationKey}>
                  <Trigger className={cn(linkClasses, 'gap-2')}>
                    {t(link.translationKey)}{' '}
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </Trigger>
                  <Content className="absolute top-0 right-0 w-full">
                    <ul className="m-0 grid w-full grid-cols-3 gap-4 p-6">
                      {link.menu.map((subLink, _i) => (
                        <li
                          key={subLink.titleTranslationKey}
                          className="col-span-1 grid"
                        >
                          <NavigationMenuLink asChild>
                            <a
                              className={cn(
                                'bg-accent text-accent-foreground flex h-full w-full flex-col justify-end rounded-md p-4 no-underline outline-none select-none',
                                'focusable',
                              )}
                              href={subLink.href}
                            >
                              <Heading variant="label">
                                {t(subLink.titleTranslationKey)}
                              </Heading>
                              <Paragraph variant="smallText">
                                {t(subLink.descriptionTranslationKey)}
                              </Paragraph>
                            </a>
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </Content>
                </Item>
              );
            }

            if (link.style === 'button') {
              return (
                <Item key={link.translationKey}>
                  <NavigationMenuLink
                    href={link.href}
                    className={buttonVariants({
                      variant: 'default',
                      size: 'sm',
                    })}
                  >
                    {t(link.translationKey)}
                  </NavigationMenuLink>
                </Item>
              );
            }

            return (
              <Item key={link.translationKey}>
                <NavigationMenuLink className={linkClasses} href={link.href}>
                  {t(link.translationKey)}
                </NavigationMenuLink>
              </Item>
            );
          })}
          <Indicator className="data-[state=visible]:animate-fadeIn data-[state=hidden]:animate-fadeOut top-full z-1 flex h-2.5 items-end justify-center overflow-hidden transition-[width,transform_250ms_ease]">
            <div className="bg-card relative top-[70%] h-3.5 w-3.5 rotate-45 rounded-tl-[2px]" />
          </Indicator>
        </List>

        <div className="absolute top-full right-0 flex justify-center perspective-[2000px]">
          <Viewport className="data-[state=open]:animate-scaleIn data-[state=closed]:animate-scaleOut bg-card relative mt-2.5 h-(--radix-navigation-menu-viewport-height) w-[calc(100vw-20rem)] origin-[top_center] overflow-hidden rounded-[6px] shadow-xl transition-[width,height] duration-300 lg:w-200" />
        </div>
      </div>
    </Root>
  );
};

export const NavigationMenuMobile = () => {
  const t = useTranslations('SharedNavigation');
  const [submenu, setSubmenu] = useState<SubMenu>([]);

  if (!submenu.length) {
    return (
      <ul
        className={'flex flex-col items-center justify-center gap-4 md:hidden'}
      >
        {links.map((link, _i) => {
          if (link.style === 'button' && link.href) {
            return (
              <li key={link.translationKey}>
                <Link
                  className={buttonVariants({
                    variant: 'default',
                    size: 'sm',
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
                <button
                  type="button"
                  className={linkClasses}
                  onClick={() => setSubmenu(link.menu)}
                >
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
    <ul className={'flex flex-col items-center justify-center gap-4'}>
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
          className={cn(
            buttonVariants({ variant: 'accent', size: 'sm' }),
            'inline rounded-full px-2',
          )}
          onClick={() => setSubmenu([])}
        >
          <ArrowLeftCircle className="shrink-0" />
        </button>
      </li>
    </ul>
  );
};
