import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button, headingVariants } from '@acme/ui';

import { cn } from '~/lib/utils';

export default function SharedNav({ active }: { active?: string }) {
  const t = useTranslations('SharedNavigation');

  const getLinkClasses = (name?: string) =>
    cn(
      headingVariants({ variant: 'h4-all-caps' }),
      'underline-offset-8 hover:text-success',
      name === active && 'text-success underline',
    );

  return (
    <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
      <Link href="/" aria-label="Home page" className="pr-10">
        <Image
          src="/images/mark.svg"
          alt="Network Canvas Documentation"
          width={48}
          height={48}
          className="h-9 w-9 lg:hidden"
        />
        <Image
          src="/images/typemark-negative.svg"
          alt="Network Canvas Documentation"
          height={48} //5.27
          width={275}
          className="hidden h-12 w-auto lg:block "
        />
      </Link>
      <ul className="flex items-center gap-10">
        <li>
          <Link
            href="https://community.networkcanvas.com"
            className={getLinkClasses('Community')}
          >
            {t('community')}
          </Link>
        </li>
        <li>
          <Link href="/" className={getLinkClasses('Documentation')}>
            {t('documentation')}
          </Link>
        </li>
        <li>
          <Link href="#" className={getLinkClasses()}>
            {t('projects')}
          </Link>
        </li>
        <li>
          <Link href="https://networkcanvas.com/download">
            <Button>{t('download')}</Button>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
