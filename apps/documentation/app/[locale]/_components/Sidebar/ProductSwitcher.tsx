'use client';

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@acme/ui';

import { useRouter } from '~/navigation';

export default function ProductSwitcher() {
  const pathName = usePathname();
  const currentProduct = pathName.split('/')[1]; // splitting pathname to get current "product"

  const router = useRouter();
  const t = useTranslations('ProductSwitcher');
  const locale = useLocale();

  return (
    <Select
      value={currentProduct}
      onValueChange={(val) => {
        router.push(`/${val}`, { locale });
      }}
    >
      <SelectTrigger className="hover:bg-slate-100 dark:hover:bg-slate-800 h-16 w-full text-sm transition-colors lg:text-base">
        <SelectValue placeholder={t('selectPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem className="text-sm lg:text-base" value="desktop">
            {t('desktop')}
          </SelectItem>
          <SelectItem className="text-sm lg:text-base" value="fresco">
            {t('fresco')}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
