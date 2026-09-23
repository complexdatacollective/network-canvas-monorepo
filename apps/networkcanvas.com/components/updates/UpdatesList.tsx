'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
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

function updateIdFromHash(updates: readonly Update[]) {
  const id = decodeURIComponent(window.location.hash.slice(1));
  return updates.some((update) => update.id === id) ? id : undefined;
}

export function UpdatesList({ updates }: { updates: readonly Update[] }) {
  const t = useTranslations('UpdatesPage');
  const format = useFormatter();
  const [openIds, setOpenIds] = useState<string[]>(() =>
    updates[0] ? [updates[0].id] : [],
  );

  // A link to one update has to reveal it even when it is collapsed.
  useEffect(() => {
    const reveal = () => {
      const id = updateIdFromHash(updates);
      if (!id) return;
      setOpenIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
    };

    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [updates]);

  return (
    <Accordion<string>
      multiple
      value={openIds}
      onValueChange={setOpenIds}
      className="divide-text/10 mx-auto max-w-3xl gap-0 divide-y"
    >
      {updates.map((update) => (
        <AccordionItem key={update.id} value={update.id} className="py-6">
          <AccordionHeader
            render={({ children, ...props }) => <h2 {...props}>{children}</h2>}
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
          <AccordionPanel className="mt-4" inert={!openIds.includes(update.id)}>
            <RenderMarkdown
              allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
              components={markdownComponents}
            >
              {update.body}
            </RenderMarkdown>
            <Paragraph intent="smallText" margin="none" className="mt-6">
              <NativeLink href={`#${update.id}`}>{t('permalink')}</NativeLink>
            </Paragraph>
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
