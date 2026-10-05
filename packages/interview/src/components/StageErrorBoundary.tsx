'use client';

import React, { Component, type ReactNode } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import Icon from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useCaptureException } from '../analytics/useTrack';
import useOnline from '../hooks/useOnline';
import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import CopyDebugInfoButton from './CopyDebugInfoButton';

// Build the copyable debug string. The stack alone is not enough: Firefox's
// Error.stack contains only call frames, not the error message, so copying
// `error.stack` there silently drops the single most useful piece of
// information (e.g. "Failed to initialize WebGL"). Always lead with the
// name/message so reports are actionable regardless of browser.
function formatDebugInfo(error: Error): string {
  const heading = error.message
    ? `${error.name}: ${error.message}`
    : error.name;
  return error.stack ? `${heading}\n\n${error.stack}` : heading;
}

type StageErrorBoundaryInnerProps = {
  children: ReactNode;
  captureException: (error: Error, props?: Record<string, unknown>) => void;
  isOffline: boolean;
};

type StageErrorBoundaryState = {
  error?: Error;
};

class StageErrorBoundaryInner extends Component<
  StageErrorBoundaryInnerProps,
  StageErrorBoundaryState
> {
  constructor(props: StageErrorBoundaryInnerProps) {
    super(props);
    this.state = {};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.captureException(error, {
      component_stack: info.componentStack,
      feature: 'stage-error-boundary',
      is_offline: this.props.isOffline,
    });
    this.setState({ error });
  }

  render() {
    const { children, isOffline } = this.props;
    const { error } = this.state;

    if (error) {
      return (
        <Surface noContainer className="mx-auto h-fit max-w-2xl grow-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center justify-center">
              <Icon name="error" />
            </div>
            {isOffline ? (
              <div data-testid="offline-error-message">
                <Heading>
                  <AppMessage message={messages.offlineTaskTitle} />
                </Heading>
                <Paragraph>
                  <AppMessage message={messages.offlineTaskDescription} />
                </Paragraph>
              </div>
            ) : (
              <div>
                <Heading>
                  <AppMessage message={messages.taskErrorTitle} />
                </Heading>
                <Paragraph>
                  <AppMessage message={messages.taskErrorDescription} />
                </Paragraph>
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <CopyDebugInfoButton debugInfo={formatDebugInfo(error)} />
          </div>
        </Surface>
      );
    }

    return children;
  }
}

type StageErrorBoundaryProps = {
  children: ReactNode;
};

const StageErrorBoundary = ({ children }: StageErrorBoundaryProps) => {
  const captureException = useCaptureException();
  const isOnline = useOnline();
  return (
    <StageErrorBoundaryInner
      captureException={captureException}
      isOffline={!isOnline}
    >
      {children}
    </StageErrorBoundaryInner>
  );
};

export default StageErrorBoundary;
