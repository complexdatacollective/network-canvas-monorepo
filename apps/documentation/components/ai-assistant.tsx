'use client';

import { env } from '~/env.mjs';
import { MendableInPlace } from '@mendable/search';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContentEmpty,
  DialogTrigger,
  Paragraph,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  dialogContentClasses,
} from '@acme/ui';
import { cn } from '~/lib/utils';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

const TriggerButton = () => {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations('AIAssistant');

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ref.current?.click();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            role="button"
            ref={ref}
            tabIndex={0}
            className="fixed bottom-6 right-6 z-10 flex h-20 w-20 flex-col items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' }}
          >
            <span className="text-2xl">🤖</span>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent className="bg-accent text-accent-foreground">
          <Paragraph variant="smallText">
            {t('popupText')}

            <kbd className="pointer-events-none ml-4 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>J
            </kbd>
          </Paragraph>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const AIAssistant = () => {
  const t = useTranslations('AIAssistant');

  return (
    <Dialog>
      <DialogTrigger>
        <TriggerButton />
      </DialogTrigger>
      <DialogContentEmpty>
        <div className={cn(dialogContentClasses)}>
          <MendableInPlace
            style={{ darkMode: false, accentColor: '#5259eb' }}
            anon_key={env.NEXT_PUBLIC_MENDABLE_ANON_KEY}
            hintText={t('dialogPlaceholder')}
            messageSettings={{
              prettySources: true,
              openSourcesInNewTab: false,
            }}
            hintQuestions={[t('q1'), t('q2')]}
            welcomeMessage={t('welcomeMessage')}
          />
        </div>
      </DialogContentEmpty>
    </Dialog>
  );
};

export default AIAssistant;
