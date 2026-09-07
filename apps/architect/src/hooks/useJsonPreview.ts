import { useCallback, useEffect, useState } from 'react';
import { useRoute } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useAppSelector } from '~/ducks/hooks';
import { getProtocol, getStage } from '~/selectors/protocol';
const messages = defineMessages({
  stageJSON: {
    id: 'architect.hooks.useJsonPreview.stageJSON',
    defaultMessage: 'Stage JSON',
    description: 'The label text in hooks / useJsonPreview.',
  },
  protocolJSON: {
    id: 'architect.hooks.useJsonPreview.protocolJSON',
    defaultMessage: 'Protocol JSON',
    description: 'The label text in hooks / useJsonPreview.',
  },
});

type JsonPreviewContext = {
  label: string;
  data: unknown;
} | null;

export function useJsonPreview() {
  const intl = useAppIntl();
  const [isOpen, setIsOpen] = useState(false);

  const [, stageParams] = useRoute('/protocol/stage/:stageId');
  const stageId = stageParams?.stageId;
  const isStageRoute = !!stageId && stageId !== 'new';

  const protocol = useAppSelector(getProtocol);
  const stage = useAppSelector((state) =>
    isStageRoute ? getStage(state, stageId) : null,
  );

  const context: JsonPreviewContext =
    isStageRoute && stage
      ? { label: intl.formatMessage(messages.stageJSON), data: stage }
      : protocol
        ? { label: intl.formatMessage(messages.protocolJSON), data: protocol }
        : null;

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyJ') {
        e.preventDefault();
        toggle();
      }

      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggle, close]);

  return { isOpen, context, close };
}
