'use client';

import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandGroup,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { algolia_client } from '@/lib/algolia-client.mjs';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Hits, InstantSearch, Configure } from 'react-instantsearch';
import CustomSearchBox from './CustomSearchBox';
import EmptyQueryBoundary from './EmptyQueryBoundary';
import Hit from './Hit';
import algoliaLogo from '@/public/algolia-logo.svg';
import NoResultsBoundary from './NoResultsBoundary';
import { DialogContextProvider } from './Provider/DialogContext';
import { env } from '@/env.mjs';
import Link from 'next/link';
import Image from 'next/image';

export default function SearchCommand() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const t = useTranslations('SearchCommand');

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [setOpen]);

  return (
    <DialogContextProvider open={open} setOpen={setOpen}>
      <InstantSearch
        searchClient={algolia_client}
        indexName={env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME}
        insights={true}
      >
        <Configure filters={`lang:${locale}`} />
        <Button
          className="flex min-w-[250px] items-center justify-between gap-1 px-2 text-left"
          variant={'secondary'}
          onClick={() => setOpen(true)}
        >
          <span>{t('searchPlaceholder')}</span>
          <span className="rounded-lg bg-white p-2 text-xs dark:bg-slate-900">
            Ctrl+K
          </span>
        </Button>

        <CommandDialog open={open} onOpenChange={setOpen}>
          <CustomSearchBox placeholder={t('searchPlaceholder')} />
          <CommandSeparator />

          <CommandList>
            <NoResultsBoundary noResultForTxt={t('searchNoResultsFor')} />
            <CommandGroup>
              <EmptyQueryBoundary noResultTxt={t('searchNoResults')}>
                <Hits hitComponent={Hit} />
              </EmptyQueryBoundary>
            </CommandGroup>
          </CommandList>
          <CommandList>
            <CommandSeparator />
            <Link
              href={'https://algolia.com'}
              target="_blank"
              className="mx-3 my-2 flex items-center justify-end gap-1"
            >
              <span className="text-[14px]">Search by</span>
              <Image
                width="70"
                height="70"
                priority
                src={algoliaLogo as string}
                alt="LogoAlgolia"
              />
            </Link>
          </CommandList>
        </CommandDialog>
      </InstantSearch>
    </DialogContextProvider>
  );
}
