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
        distinct_id: 'interview-42',
      }),
    );
    expect(client.register).not.toHaveBeenCalled();
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
      expect(client.capture).toHaveBeenLastCalledWith(
        'node_added',
        expect.objectContaining({ distinct_id: 'interview-43' }),
      );
    });
    const second = lastProps()?.node_id;
    expect(second).toEqual(expect.any(String));
    expect(second).not.toBe(ROSTER_UID);
    expect(second).not.toBe(first);
  });
});
