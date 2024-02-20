'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getLocaleBasedSidebarData, isPathExist } from '@/lib/helper_functions';
import { usePathname, useRouter } from '@/navigation';
import data from '@/public/sidebar.json';
import { type SidebarData } from '@/types';
import { useLocale } from 'next-intl';

interface LanguageSwitcherProps {
  width: string;
}

const LanguageSwitcher = ({ width }: LanguageSwitcherProps) => {
  const locale = useLocale();
  const router = useRouter();
  const pathName = usePathname();
  const sidebarData: SidebarData = JSON.parse(
    JSON.stringify(data),
  ) as SidebarData;

  function handleLanguageChange(value: string) {
    const localeBasedSidebarData = getLocaleBasedSidebarData(
      sidebarData,
      value,
    );
    let result;

    for (const folder of localeBasedSidebarData) {
      result = isPathExist(folder, pathName);
      if (result) break;
    }

    router.push(result ? pathName : '/', { locale: value });
  }

  return (
    <Select onValueChange={handleLanguageChange}>
      <SelectTrigger
        className={`bg-white hover:bg-stone-100 dark:bg-slate-700 dark:hover:bg-slate-600 ${width} space-x-1 text-xs sm:text-sm`}
      >
        <SelectValue placeholder={locale === 'en' ? 'English' : 'Русский'} />
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-slate-700">
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="ru">Русский</SelectItem>
      </SelectContent>
    </Select>
  );
};

export default LanguageSwitcher;
