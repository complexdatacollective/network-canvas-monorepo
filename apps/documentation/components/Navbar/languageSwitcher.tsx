'use client';

import { useLocale } from 'next-intl';

import { type SidebarData } from '~/app/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { getLocaleBasedSidebarData, isPathExist } from '~/lib/helper_functions';
import { usePathname, useRouter } from '~/navigation';
import data from '~/public/sidebar.json';

const LanguageSwitcher = () => {
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
      <SelectTrigger>
        <SelectValue placeholder={locale === 'en' ? 'English' : 'Русский'} />
      </SelectTrigger>
      <SelectContent className="">
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="ru">Русский</SelectItem>
      </SelectContent>
    </Select>
  );
};

export default LanguageSwitcher;
