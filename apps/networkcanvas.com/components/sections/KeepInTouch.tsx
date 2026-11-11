'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { MailingListForm } from '~/components/sections/MailingListForm';
import { entranceEase, useOnceInView } from '~/components/ui/useOnceInView';

// What next?'s closing panel: a letter rising once out of an open envelope
// that sits at the foot of the panel. The letter carries the heading, the body
// and the mailing-list form; the envelope is flat two-tone planes in the
// brand's slate blue, nothing more.

export function KeepInTouch() {
  const t = useTranslations('WhatNext.keepInTouch');
  const { ref, play, timing } = useOnceInView<HTMLElement>(0.35);
  return (
    <article
      ref={ref}
      className="tablet-portrait:mt-8 bg-slate-blue/12 tablet-landscape:pt-20 tablet-landscape:px-16 tablet-portrait:[--env:12rem] tablet-portrait:[--flap:10rem] mt-6 overflow-hidden rounded-[2.5rem] px-4 pt-14 [--env:9rem] [--flap:6rem] [--tuck:2.25rem]"
    >
      {/* The envelope runs off the panel's foot. */}
      <div className="relative mx-auto -mb-[calc(var(--env)*0.3)] max-w-[54rem] pb-[calc(var(--env)-var(--tuck))]">
        {/* Behind the letter: the open flap and the envelope's inside. */}
        <div
          aria-hidden
          className="bg-slate-blue-dark absolute inset-x-0 bottom-(--env) h-(--flap) [clip-path:polygon(0_100%,50%_0,100%_100%)]"
        />
        <div
          aria-hidden
          className="bg-cyber-grape absolute inset-x-0 bottom-0 h-(--env)"
        />

        <motion.div
          className="bg-surface text-surface-contrast elevation-high tablet-portrait:mx-[13%] tablet-portrait:px-10 tablet-portrait:pt-10 relative mx-[7%] rounded-sm px-6 pt-8 pb-[calc(var(--tuck)+2rem)]"
          initial={{ y: '3rem' }}
          animate={{ y: play ? '0rem' : '3rem' }}
          transition={timing({ duration: 1, ease: entranceEase, delay: 0.15 })}
        >
          <Heading
            level="h3"
            margin="none"
            className="text-3xl font-black tracking-tight"
          >
            {t('title')}
          </Heading>
          <Paragraph
            margin="none"
            className="text-surface-contrast/80 mt-3 text-base leading-relaxed"
          >
            {t('body')}
          </Paragraph>
          {/* The form's own top margin gives way to the letter's spacing,
              and the email field takes the row's spare width. */}
          <div className="mt-7 [&_form]:mt-0 [&_form>div:first-child]:grow">
            <MailingListForm />
          </div>
        </motion.div>

        {/* In front of the letter: the pocket, its side flaps in the darker
            tone and its bottom flap in the lighter. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-(--env)"
        >
          <div className="bg-slate-blue-dark absolute inset-0 [clip-path:polygon(0_0,50%_52%,100%_0,100%_100%,0_100%)]" />
          <div className="bg-slate-blue absolute inset-0 [clip-path:polygon(0_100%,50%_58%,100%_100%)]" />
        </div>
      </div>
    </article>
  );
}
