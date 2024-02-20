'use client';

import { env } from '@/env.mjs';
import logo from '@/public/assets/img/logo.svg';
import { MendableFloatingButton } from '@mendable/search';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const icon = (
  <div className="flex flex-col items-center">
    <Image width="50" height="50" priority src={logo as string} alt="Logo" />
    <span className="text-xs font-extrabold">Ctrl+J</span>
  </div>
);

const AIAssistant = () => {
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();
  const t = useTranslations('AIAssistant');

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    mounted && (
      <MendableFloatingButton
        icon={icon}
        style={{ accentColor: '#123456', darkMode: theme !== 'light' }}
        anon_key={env.NEXT_PUBLIC_MENDABLE_ANON_KEY}
        dialogPlaceholder={t('dialogPlaceholder')}
        messageSettings={{ prettySources: true, openSourcesInNewTab: false }}
        hintQuestions={[t('q1'), t('q2')]}
        popupText={t('popupText')}
        welcomeMessage={t('welcomeMessage')}
        cmdShortcutKey="j"
      />
    )
  );
};

export default AIAssistant;
