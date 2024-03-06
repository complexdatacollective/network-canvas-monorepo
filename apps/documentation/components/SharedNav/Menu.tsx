import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { CaretDownIcon } from '@radix-ui/react-icons';
import { cn } from '~/lib/utils';
import { forwardRef } from 'react';
import Link from 'next/link';
import { Heading, Paragraph, buttonVariants, headingVariants } from '@acme/ui';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

const links = [
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
        href: '/projects/fresco',
        image: '/images/fresco.svg',
      },
      {
        titleTranslationKey: 'projectsChildren.studio.label',
        descriptionTranslationKey: 'projectsChildren.studio.description',
        href: '/projects/studio',
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

const getLinkClasses = (name?: string) =>
  cn(
    headingVariants({ variant: 'h4-all-caps' }),
    'underline-offset-8 hover:text-success',
    // name === active && 'text-success underline',
  );

const NavigationMenuDemo = () => {
  const t = useTranslations('SharedNavigation');

  return (
    <NavigationMenu.Root className="relative z-10 flex ">
      <NavigationMenu.List className="center m-0 flex list-none items-center justify-center gap-10">
        {links.map((link, i) => {
          if (link.menu) {
            return (
              <NavigationMenu.Item key={i}>
                <NavigationMenu.Trigger
                  className={cn(getLinkClasses(), 'flex gap-2')}
                >
                  {t(link.translationKey)}{' '}
                  <CaretDownIcon
                    className="text-violet10 duration-[250] relative top-[1px] transition-transform ease-in group-data-[state=open]:-rotate-180"
                    aria-hidden
                  />
                </NavigationMenu.Trigger>
                <NavigationMenu.Content className="absolute right-0 top-0 w-full">
                  <ul className="m-0 grid grid-cols-3 gap-4 p-6 sm:w-[800px]">
                    {link.menu.map((subLink, i) => (
                      <li key={i} className="col-span-1 grid">
                        <NavigationMenu.Link asChild>
                          <a
                            className="flex h-full w-full select-none
                            flex-col justify-end rounded-[6px] bg-accent p-4 text-accent-foreground no-underline outline-none focus:shadow-md"
                            href={subLink.href}
                          >
                            {/* <Image
                              src={subLink.image}
                              width={38}
                              height={38}
                              alt=""
                              className="mb-[7px] h-[38px] w-[38px]"
                            /> */}
                            <Heading variant="label">
                              {t(subLink.titleTranslationKey)}
                            </Heading>
                            <Paragraph variant="smallText">
                              {t(subLink.descriptionTranslationKey)}
                            </Paragraph>
                          </a>
                        </NavigationMenu.Link>
                      </li>
                    ))}
                  </ul>
                </NavigationMenu.Content>
              </NavigationMenu.Item>
            );
          }

          if (link.style === 'button') {
            return (
              <NavigationMenu.Item key={i}>
                <NavigationMenu.Link
                  href={link.href}
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                >
                  {t(link.translationKey)}
                </NavigationMenu.Link>
              </NavigationMenu.Item>
            );
          }

          return (
            <NavigationMenu.Item key={i}>
              <NavigationMenu.Link
                className={getLinkClasses()}
                href={link.href}
              >
                {t(link.translationKey)}
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          );
        })}
        <NavigationMenu.Indicator className="data-[state=visible]:animate-fadeIn data-[state=hidden]:animate-fadeOut top-full z-[1] flex h-[10px] items-end justify-center overflow-hidden transition-[width,transform_250ms_ease]">
          <div className="relative top-[70%] h-[14px] w-[14px] rotate-[45deg] rounded-tl-[2px] bg-white" />
        </NavigationMenu.Indicator>
      </NavigationMenu.List>

      <div className="perspective-[2000px] absolute right-0 top-full flex w-full justify-center">
        <NavigationMenu.Viewport className="data-[state=open]:animate-scaleIn data-[state=closed]:animate-scaleOut relative mt-[10px] h-[var(--radix-navigation-menu-viewport-height)] w-full origin-[top_center] overflow-hidden rounded-[6px] bg-white shadow-xl transition-[width,_height] duration-300" />
      </div>
    </NavigationMenu.Root>
  );
};

export default NavigationMenuDemo;
