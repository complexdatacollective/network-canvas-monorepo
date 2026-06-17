'use client';

import { type ReactNode } from 'react';

import {
  APP_LABELS,
  type AppKey,
} from '~/components/customComponents/appVariants';
import { useSelectedApp } from '~/components/customComponents/useSelectedApp';

type AppOnlyProps = {
  app: AppKey;
  children: ReactNode;
};

export const AppOnly = ({ app, children }: AppOnlyProps) => {
  const [selectedApp] = useSelectedApp();
  const activeApp = selectedApp ?? APP_LABELS.web;

  if (activeApp !== APP_LABELS[app]) {
    return null;
  }

  return <>{children}</>;
};
