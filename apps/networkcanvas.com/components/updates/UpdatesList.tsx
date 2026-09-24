'use client';

import { Search, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import { IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Link } from '~/lib/i18n/navigation';
import type { Update } from '~/lib/siteContent';

function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  if (!href) return <>{children}</>;
  if (href.startsWith('/')) {
    return <NativeLink render={<Link href={href} />}>{children}</NativeLink>;
  }
  if (href.startsWith('https://')) {
    return (
      <NativeLink href={href} target="_blank" rel="noreferrer">
        {children}
      </NativeLink>
    );
  }
  return <NativeLink href={href}>{children}</NativeLink>;
}

const markdownComponents = { a: MarkdownLink };

function normalizeForSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

// Link destinations are not part of what a reader sees, so they do not match.
function searchableText(update: Update) {
  return normalizeForSearch(
    `${update.title} ${update.body.replace(/\]\([^)]*\)/g, ']')}`,
  );
}

function matchingIds(
  updates: readonly (Update & { searchText: string })[],
  query: string,
) {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  return updates
    .filter((update) => terms.every((term) => update.searchText.includes(term)))
    .map((update) => update.id);
}

function updateIdFromHash(updates: readonly Update[]) {
  const id = decodeURIComponent(window.location.hash.slice(1));
  return updates.some((update) => update.id === id) ? id : undefined;
}

export function UpdatesList({ updates }: { updates: readonly Update[] }) {
  const t = useTranslations('UpdatesPage');
  const format = useFormatter();
  const defaultOpenIds = updates[0] ? [updates[0].id] : [];
  const [openIds, setOpenIds] = useState<string[]>(defaultOpenIds);
  const [query, setQuery] = useState('');
  const searchable = useMemo(
    () =>
      updates.map((update) => ({
        ...update,
        searchText: searchableText(update),
      })),
    [updates],
  );
  const searching = query.trim() !== '';
  const visibleIds = searching
    ? matchingIds(searchable, query)
    : updates.map((update) => update.id);
  const visibleUpdates = updates.filter((update) =>
    visibleIds.includes(update.id),
  );

  // Every match opens so the text that matched is on screen.
  const changeQuery = (value: string) => {
    setQuery(value);
    setOpenIds(value.trim() ? matchingIds(searchable, value) : defaultOpenIds);
  };

  // A link to one update has to reveal it even when it is collapsed.
  useEffect(() => {
    const reveal = () => {
      const id = updateIdFromHash(updates);
      if (!id) return;
      setQuery('');
      setOpenIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
    };

    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [updates]);

  return (
    <div className="mx-auto max-w-3xl pt-8">
      <UnconnectedField
        name="updates-search"
        label={t('search.label')}
        labelHidden
        component={InputField}
        type="search"
        value={query}
        onChange={(value) => changeQuery(value ?? '')}
        placeholder={t('search.placeholder')}
        className="w-full"
        prefixComponent={<Search aria-hidden />}
        suffixComponent={
          query ? (
            <IconButton
              size="md"
              variant="text"
              aria-label={t('search.clear')}
              icon={<X aria-hidden />}
              onClick={() => changeQuery('')}
            />
          ) : undefined
        }
        size="md"
      />
      <Paragraph
        margin="none"
        intent="meta"
        emphasis="muted"
        aria-live="polite"
        className="mt-3"
      >
        {searching
          ? t('search.results', {
              count: visibleUpdates.length,
              total: updates.length,
            })
          : null}
      </Paragraph>
      {visibleUpdates.length === 0 ? (
        <div className="py-10 text-center">
          <Heading level="h3" margin="none">
            {t('search.emptyHeading')}
          </Heading>
          <Paragraph margin="none" emphasis="muted" className="mt-3">
            {t('search.emptyDescription')}
          </Paragraph>
        </div>
      ) : null}
      <Accordion<string>
        multiple
        value={openIds}
        onValueChange={setOpenIds}
        className="divide-text/10 gap-0 divide-y"
      >
        {visibleUpdates.map((update) => (
          <AccordionItem key={update.id} value={update.id} className="py-6">
            <AccordionHeader
              render={({ children, ...props }) => (
                <h2 {...props}>{children}</h2>
              )}
              id={update.id}
              className="scroll-mt-24"
            >
              <AccordionTrigger className="text-text items-start text-left text-2xl tracking-normal normal-case">
                <span className="flex flex-col gap-1">
                  <span className="text-pretty">{update.title}</span>
                  <time
                    dateTime={update.date}
                    className="text-text/60 text-sm font-normal"
                  >
                    {t('published', {
                      date: format.dateTime(new Date(update.date), {
                        dateStyle: 'long',
                        timeZone: 'UTC',
                      }),
                    })}
                  </time>
                </span>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel
              className="mt-4"
              inert={!openIds.includes(update.id)}
            >
              <RenderMarkdown
                allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
                components={markdownComponents}
              >
                {update.body}
              </RenderMarkdown>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
