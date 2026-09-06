import type { PostHogConfig } from 'posthog-js/dist/module.slim.no-external';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  constructed: vi.fn(),
  init: vi.fn(),
  capture: vi.fn(),
  shutdown: vi.fn(async () => {}),
  loaded: vi.fn(),
}));
vi.mock('posthog-js/dist/module.slim.no-external', () => {
  sdk.loaded();
  return {
    PostHog: class {
      constructor() {
        sdk.constructed();
      }
      init = sdk.init;
      capture = sdk.capture;
      shutdown = sdk.shutdown;
    },
  };
});

import { createClientTelemetry } from '../telemetry.ts';

const context = {
  mode: 'self-hosted',
  runtime: 'client',
  version: '0.2.0',
} as const;
const CANARY = 'person@example.test/private-protocol?access_token=SecretCanary';
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('client telemetry ownership', () => {
  it('does not load or construct the SDK, attach browser hooks or schedule work when off', async () => {
    const listeners = vi.spyOn(window, 'addEventListener');
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const timeouts = vi.spyOn(globalThis, 'setTimeout');
    const telemetry = createClientTelemetry();
    await telemetry.start(false, context);
    telemetry.capture('client_render', new Error(CANARY));
    await telemetry.close();
    expect(sdk.loaded).not.toHaveBeenCalled();
    expect(sdk.constructed).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.shutdown).not.toHaveBeenCalled();
    expect(listeners).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
    expect(timeouts).not.toHaveBeenCalled();
  });

  it('owns removable error hooks without swallowing errors, and never initializes twice', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const telemetry = createClientTelemetry();
    await telemetry.start(true, context);
    await telemetry.start(true, context);
    const onError = add.mock.calls.find(([type]) => type === 'error')?.[1];
    const onRejection = add.mock.calls.find(
      ([type]) => type === 'unhandledrejection',
    )?.[1];
    if (typeof onError !== 'function' || typeof onRejection !== 'function')
      throw new Error('owned hooks not installed');
    expect(sdk.constructed).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const error = new ErrorEvent('error', {
      error: new Error(CANARY),
      cancelable: true,
    });
    onError.call(window, error);
    const rejection = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(rejection, 'reason', {
      value: { message: CANARY, cause: { protocol: CANARY } },
    });
    onRejection.call(window, rejection);
    expect(error.defaultPrevented).toBe(false);
    expect(rejection.defaultPrevented).toBe(false);
    expect(sdk.capture).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain(CANARY);
    await telemetry.close();
    expect(remove).toHaveBeenCalledWith('error', onError);
    expect(remove).toHaveBeenCalledWith('unhandledrejection', onRejection);
    onError.call(window, error);
    onRejection.call(window, rejection);
    telemetry.capture('client_render', new Error(CANARY));
    expect(sdk.capture).toHaveBeenCalledTimes(2);
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
  });

  it('a stop while the lazy import is pending cannot later start an SDK or listeners', async () => {
    const listeners = vi.spyOn(window, 'addEventListener');
    const telemetry = createClientTelemetry();
    const pending = telemetry.start(true, context);
    await telemetry.close();
    await pending;
    expect(sdk.constructed).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(listeners).not.toHaveBeenCalled();
    await telemetry.start(true, context);
    expect(sdk.constructed).not.toHaveBeenCalled();
  });

  it('disables all automatic channels and rebuilds actual SDK default properties at before_send', async () => {
    const telemetry = createClientTelemetry();
    await telemetry.start(true, context);
    try {
      const config = sdk.init.mock.calls[0]?.[1] as Partial<PostHogConfig>;
      expect(config).toMatchObject({
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        capture_exceptions: false,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        person_profiles: 'never',
        persistence: 'memory',
        disable_persistence: true,
        ip: false,
      });
      telemetry.capture(
        'client_render',
        Object.assign(new Error(CANARY), { name: CANARY, protocol: CANARY }),
      );
      const report: unknown = sdk.capture.mock.calls[0]?.[1];
      if (typeof report !== 'object' || report === null)
        throw new Error('capture did not build a report');
      const before = config.before_send;
      if (typeof before !== 'function')
        throw new Error('before_send is not installed');
      const event = before({
        uuid: '7f7fc01e-82b1-4b31-8ce7-9ea1b24e22db',
        event: '$exception',
        properties: {
          ...report,
          $current_url: CANARY,
          $referrer: CANARY,
          $session_id: CANARY,
          $device_id: CANARY,
        },
        $set: { email: CANARY },
        $set_once: { protocol: CANARY },
      });
      expect(event).not.toBeNull();
      expect(JSON.stringify(event)).toContain('client_render');
      expect(JSON.stringify(event)).not.toContain(CANARY);
      expect(event?.properties).not.toHaveProperty('$current_url');
      expect(event).not.toHaveProperty('$set');
      expect(
        before({
          uuid: '7f7fc01e-82b1-4b31-8ce7-9ea1b24e22db',
          event: '$pageview',
          properties: { ...report, url: CANARY },
        }),
      ).toBeNull();
    } finally {
      await telemetry.close();
    }
  });

  it('bounds storms regardless of exception names and does not retain raw errors', async () => {
    const telemetry = createClientTelemetry();
    await telemetry.start(true, context);
    try {
      for (let i = 0; i < 100; i++)
        telemetry.capture(
          'client_error',
          Object.assign(new Error(CANARY), { name: `Private-${i}` }),
        );
      expect(sdk.capture).toHaveBeenCalledTimes(10);
      expect(JSON.stringify(sdk.capture.mock.calls)).not.toMatch(
        /Private|SecretCanary/,
      );
    } finally {
      await telemetry.close();
    }
  });
});
