import { Link } from '@/navigation';
import logo from '@/public/assets/img/logo.svg';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import DocSearchComponent from './Search/DocSearchComponent';
import LanguageSwitcher from './languageSwitcher';
import { ThemeToggle } from './themeToggle';

const Navbar = () => {
  const t = useTranslations('Navbar');

  return (
    <div className="sticky top-0 z-50 mb-5 border-b border-slate-200 bg-slate-950">
      <div className="container flex h-16 items-center justify-between p-1">
        <Link href={'/'} className="flex items-center gap-0.5">
          <Image
            width="40"
            height="40"
            priority
            src={logo as string}
            alt="Logo"
          />
          <span className="text-white">Network Canvas</span>
        </Link>
        <div className="flex items-center gap-3">
          <DocSearchComponent />
          <LanguageSwitcher width="w-fit" />
          <ThemeToggle />
          <Link
            className="btn inline-block rounded-md bg-white p-2 text-center text-sm transition-colors hover:bg-stone-100 dark:bg-slate-700 dark:hover:bg-slate-600"
            href={'https://community.networkcanvas.com'}
            target="_blank"
          >
            {t('communityBtn')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
