import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Button } from '@acme/ui';

import { Link } from '~/navigation';
import LanguageSwitcher from './languageSwitcher';
import DocSearchComponent from './Search/DocSearchComponent';
import { ThemeToggle } from './themeToggle';

const Navbar = () => {
  const t = useTranslations('Navbar');

  return (
    <nav role="navigation" className="sticky top-0 z-50 mb-5 bg-primary">
      <div className="container flex h-16 items-center justify-between p-1">
        <Link href={'/'} className="flex items-center gap-0.5">
          <Image
            width="40"
            height="40"
            priority
            src="/assets/img/logo.svg"
            alt="Logo"
          />
        </Link>
        <div className="flex items-center gap-3">
          <DocSearchComponent />
          <LanguageSwitcher />
          <ThemeToggle />
          <Link href={'https://community.networkcanvas.com'} target="_blank">
            <Button variant="accent">{t('communityBtn')}</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
