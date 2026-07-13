'use client';

import { type ReactNode } from 'react';

import {
  APP_LABELS,
  type AppKey,
  INTERVIEWER_LABELS,
  type InterviewerKey,
} from '~/components/customComponents/appVariants';
import { useSelectedApp } from '~/components/customComponents/useSelectedApp';

type AppOnlyProps =
  | { axis?: 'architect'; app: AppKey; children: ReactNode }
  | { axis: 'interviewer'; app: InterviewerKey; children: ReactNode };

export const AppOnly = (props: AppOnlyProps) => {
  const axis = props.axis === 'interviewer' ? 'interviewer' : 'architect';
  const [selectedApp] = useSelectedApp(axis);

  if (props.axis === 'interviewer') {
    const activeApp = selectedApp ?? INTERVIEWER_LABELS.current;
    return activeApp === INTERVIEWER_LABELS[props.app] ? (
      <>{props.children}</>
    ) : null;
  }

  const activeApp = selectedApp ?? APP_LABELS.current;
  return activeApp === APP_LABELS[props.app] ? <>{props.children}</> : null;
};
