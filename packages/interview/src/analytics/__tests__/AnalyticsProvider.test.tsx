import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { InterviewPayload } from '../../contract/types';
import { AnalyticsProvider } from '../AnalyticsProvider';
import { useTrack } from '../useTrack';

const payload = {
  session: { id: 'interview-42' },
  protocol: { hash: 'h-x' },
} as InterviewPayload;

// The shape `makeVariableUUIDReplacer` mints for an external-data row:
// recomputable by anyone holding the roster, and identical in every interview.
const ROSTER_UID = 'person_pKqRz1sWm3';

function Probe() {
  const track = useTrack();
  return (
    <button type="button" onClick={() => track('test_event', { foo: 'bar' })}>
      fire
    </button>
  );
}

function NodeProbe() {
  const track = useTrack();
  return (
    <button
      type="button"
      onClick={() => track('node_added', { node_id: ROSTER_UID })}
    >
      fire
    </button>
  );
}

describe('AnalyticsProvider', () => {
  it('uses NULL_TRACKER when disableAnalytics=true', () => {
    const client = {
      capture: vi.fn(),
      register: vi.fn(),
      captureException: vi.fn(),
    };
    const { getByRole } = render(
      <AnalyticsProvider
        analytics={{ installationId: 'i1', hostApp: 'Fresco' }}
        posthogClient={client as never}
        disableAnalytics={true}
        payload={payload}
      >
        <Probe />
      </AnalyticsProvider>,
    );
    act(() => {
      getByRole('button').click();
    });
    expect(client.capture).not.toHaveBeenCalled();
  });

  it('forwards events to a host-supplied client without calling register on it', async () => {
    const client = {
      capture: vi.fn(),
      register: vi.fn(),
      captureException: vi.fn(),
    };
    const { getByRole } = render(
      <AnalyticsProvider
        analytics={{ installationId: 'i1', hostApp: 'Fresco' }}
        posthogClient={client as never}
        disableAnalytics={false}
        payload={payload}
      >
        <Probe />
      </AnalyticsProvider>,
    );
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      expect(client.capture).toHaveBeenCalled();
    });
    expect(client.capture).toHaveBeenCalledWith(
      'test_event',
      expect.objectContaining({
        foo: 'bar',
        app: 'Fresco',
        $app_name: 'Fresco',
        installation_id: 'i1',
        protocol_hash: 'h-x',
        distinct_id: expect.any(String),
      }),
    );
    expect(client.register).not.toHaveBeenCalled();
  });

  // The session id is, in a remote deployment, the participant's unauthenticated
  // access link, and analytics leave the deployment. The distinct id stamped on
  // every event must therefore be a pseudonym: never the session id, stable for
  // the life of the session, and different for a different session.
  it('stamps a random per-session distinct id, never the session id', async () => {
    const client = {
      capture: vi.fn(),
      register: vi.fn(),
      captureException: vi.fn(),
    };
    const distinctIdOfLastCapture = () =>
      (client.capture.mock.lastCall?.[1] as Record<string, unknown> | undefined)
        ?.distinct_id;
    const session = (id: string, hostVersion?: string) => (
      <AnalyticsProvider
        analytics={{ installationId: 'i1', hostApp: 'Fresco', hostVersion }}
        posthogClient={client as never}
        disableAnalytics={false}
        payload={
          { session: { id }, protocol: { hash: 'h-x' } } as InterviewPayload
        }
      >
        <Probe />
      </AnalyticsProvider>
    );
    const UUID_V4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    const { getByRole, rerender } = render(session('interview-42'));
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      expect(client.capture).toHaveBeenCalled();
    });
    const first = distinctIdOfLastCapture();
    expect(first).toMatch(UUID_V4);
    expect(first).not.toBe('interview-42');

    // Same session, tracker rebuilt by a changed super-property set: the same
    // pseudonym, or one session's events would split in two.
    rerender(session('interview-42', '2'));
    const callsBefore = client.capture.mock.calls.length;
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      expect(client.capture.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    expect(distinctIdOfLastCapture()).toBe(first);

    // A different session gets a different pseudonym, still not its id.
    rerender(session('interview-43', '2'));
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      expect(distinctIdOfLastCapture()).not.toBe(first);
    });
    const second = distinctIdOfLastCapture();
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe('interview-43');
  });

  // The session's entity-id mapping is held here, in a ref, rather than inside
  // the tracker: the tracker is rebuilt whenever its super properties change,
  // and a mapping the tracker owned would renumber a live interview's nodes
  // mid-session, splitting one node's events in two.
  it('keeps one pseudonym for a node across a tracker rebuilt mid-session', async () => {
    const client = {
      capture: vi.fn(),
      register: vi.fn(),
      captureException: vi.fn(),
    };
    const lastProps = () =>
      client.capture.mock.calls.at(-1)?.[1] as
        | Record<string, unknown>
        | undefined;

    const { getByRole, rerender } = render(
      <AnalyticsProvider
        analytics={{ installationId: 'i1', hostApp: 'Fresco' }}
        posthogClient={client as never}
        disableAnalytics={false}
        payload={payload}
      >
        <NodeProbe />
      </AnalyticsProvider>,
    );
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      expect(client.capture).toHaveBeenCalled();
    });
    const first = lastProps()?.node_id;
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(ROSTER_UID);

    // New analytics metadata means new super properties, which is what rebuilds
    // the tracker. `host_version` on the captured event is the proof that the
    // rebuilt one — not the original — reported the second event.
    rerender(
      <AnalyticsProvider
        analytics={{
          installationId: 'i1',
          hostApp: 'Fresco',
          hostVersion: '2',
        }}
        posthogClient={client as never}
        disableAnalytics={false}
        payload={payload}
      >
        <NodeProbe />
      </AnalyticsProvider>,
    );
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      expect(client.capture).toHaveBeenLastCalledWith(
        'node_added',
        expect.objectContaining({ host_version: '2' }),
      );
    });
    expect(lastProps()?.node_id).toBe(first);
  });

  it('mints a different pseudonym for the same node in a later session', async () => {
    const client = {
      capture: vi.fn(),
      register: vi.fn(),
      captureException: vi.fn(),
    };
    const lastProps = () =>
      client.capture.mock.calls.at(-1)?.[1] as
        | Record<string, unknown>
        | undefined;

    const { getByRole, rerender } = render(
      <AnalyticsProvider
        analytics={{ installationId: 'i1', hostApp: 'Fresco' }}
        posthogClient={client as never}
        disableAnalytics={false}
        payload={payload}
      >
        <NodeProbe />
      </AnalyticsProvider>,
    );
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      expect(client.capture).toHaveBeenCalled();
    });
    const first = lastProps()?.node_id;
    const firstDistinctId = lastProps()?.distinct_id;

    rerender(
      <AnalyticsProvider
        analytics={{ installationId: 'i1', hostApp: 'Fresco' }}
        posthogClient={client as never}
        disableAnalytics={false}
        payload={
          {
            session: { id: 'interview-43' },
            protocol: { hash: 'h-x' },
          } as InterviewPayload
        }
      >
        <NodeProbe />
      </AnalyticsProvider>,
    );
    await waitFor(() => {
      act(() => {
        getByRole('button').click();
      });
      // The new session's tracker is in place once the distinct id has moved
      // on; a click before that still reaches the old session's tracker.
      expect(client.capture).toHaveBeenLastCalledWith(
        'node_added',
        expect.objectContaining({ distinct_id: expect.any(String) }),
      );
      expect(lastProps()?.distinct_id).not.toBe(firstDistinctId);
    });
    expect(lastProps()?.distinct_id).not.toBe('interview-43');
    const second = lastProps()?.node_id;
    expect(second).toEqual(expect.any(String));
    expect(second).not.toBe(ROSTER_UID);
    expect(second).not.toBe(first);
  });
});
