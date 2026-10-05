import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PWA_BUILD_LEASE_READY,
  PWA_BUILD_LEASE_REQUEST,
  PWA_BUILD_LEASE_RESPONSE,
  registerPwaBuildLease,
} from '../registerPwaBuildLease';

function createServiceWorkerContainer() {
  const events = new EventTarget();
  const controller = { postMessage: vi.fn() };
  const serviceWorker = {
    controller,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };

  return {
    controller,
    dispatch: (event: Event) => events.dispatchEvent(event),
    serviceWorker,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('registerPwaBuildLease', () => {
  it('announces its build and responds directly to a worker lease request', () => {
    const { controller, dispatch, serviceWorker } =
      createServiceWorkerContainer();
    const requestingWorker = { postMessage: vi.fn() };
    const unregister = registerPwaBuildLease(
      'architect-8.2.0-turbo-current',
      serviceWorker,
    );

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: PWA_BUILD_LEASE_READY,
      buildId: 'architect-8.2.0-turbo-current',
    });

    const request = new MessageEvent('message', {
      data: {
        type: PWA_BUILD_LEASE_REQUEST,
        requestId: 'lease-round-1',
      },
    });
    Object.defineProperty(request, 'source', { value: requestingWorker });
    dispatch(request);

    expect(requestingWorker.postMessage).toHaveBeenCalledWith({
      type: PWA_BUILD_LEASE_RESPONSE,
      requestId: 'lease-round-1',
      buildId: 'architect-8.2.0-turbo-current',
    });

    unregister();
  });

  it('ignores malformed requests and stops responding after unregistering', () => {
    const { dispatch, serviceWorker } = createServiceWorkerContainer();
    const requestingWorker = { postMessage: vi.fn() };
    const unregister = registerPwaBuildLease(
      'interviewer-8.2.0-turbo-current',
      serviceWorker,
    );

    const dispatchRequest = (data: unknown) => {
      const event = new MessageEvent('message', { data });
      Object.defineProperty(event, 'source', { value: requestingWorker });
      dispatch(event);
    };

    dispatchRequest({ type: PWA_BUILD_LEASE_REQUEST });
    expect(requestingWorker.postMessage).not.toHaveBeenCalled();

    unregister();
    dispatchRequest({
      type: PWA_BUILD_LEASE_REQUEST,
      requestId: 'lease-round-2',
    });
    expect(requestingWorker.postMessage).not.toHaveBeenCalled();
  });
});
