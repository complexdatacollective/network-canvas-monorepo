import { describe, expect, it, vi } from 'vitest';

import { createEntityIdPseudonymiser } from '../entityIds';
import { createTracker, NULL_TRACKER } from '../tracker';

const baseSuperProps = {
  app: 'Fresco',
  $app_name: 'Fresco',
  installation_id: 'i1',
  package_version: '1',
  protocol_hash: 'h',
} as const;

describe('createTracker', () => {
  it('calls capture with merged super-props, event-props, and distinct_id override', () => {
    const client = { capture: vi.fn(), captureException: vi.fn() };
    const tracker = createTracker({
      client: client as never,
      superProperties: baseSuperProps,
      distinctId: 'session-1',
      ownsInstance: false,
    });
    tracker.track('node_added', { node_id: 'n1', node_type: 'person' });
    expect(client.capture).toHaveBeenCalledWith(
      'node_added',
      expect.objectContaining({
        node_id: expect.any(String),
        node_type: 'person',
        app: 'Fresco',
        $app_name: 'Fresco',
        installation_id: 'i1',
        package_version: '1',
        protocol_hash: 'h',
        distinct_id: 'session-1',
      }),
    );
  });

  it('does NOT merge super-props when ownsInstance=true (relies on register())', () => {
    const client = { capture: vi.fn(), captureException: vi.fn() };
    const tracker = createTracker({
      client: client as never,
      superProperties: baseSuperProps,
      distinctId: 'session-1',
      ownsInstance: true,
    });
    tracker.track('node_added', { node_id: 'n1' });
    const props = client.capture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(props.app).toBeUndefined();
    expect(props.distinct_id).toBe('session-1');
  });

  it('captureException merges feature tag and distinct_id into properties', () => {
    const client = { capture: vi.fn(), captureException: vi.fn() };
    const tracker = createTracker({
      client: client as never,
      superProperties: baseSuperProps,
      distinctId: 'session-1',
      ownsInstance: false,
    });
    const err = new Error('boom');
    tracker.captureException(err, { feature: 'external-data' });
    expect(client.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        feature: 'external-data',
        $app_name: 'Fresco',
        distinct_id: 'session-1',
      }),
    );
  });

  it('reports a session pseudonym for an entity id, never the id itself', () => {
    const client = { capture: vi.fn(), captureException: vi.fn() };
    const tracker = createTracker({
      client: client as never,
      superProperties: baseSuperProps,
      distinctId: 'session-1',
      ownsInstance: false,
    });
    // The shape `makeVariableUUIDReplacer` mints for an external-data row:
    // recomputable by anyone holding the roster.
    const rosterUid = 'person_pKqRz1sWm3';
    tracker.track('node_added', { node_id: rosterUid, node_type: 'person' });
    const props = client.capture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(props.node_id).toEqual(expect.any(String));
    expect(props.node_id).not.toBe(rosterUid);
  });

  it('keeps one pseudonym per entity within a session, across events', () => {
    const client = { capture: vi.fn(), captureException: vi.fn() };
    const tracker = createTracker({
      client: client as never,
      superProperties: baseSuperProps,
      distinctId: 'session-1',
      ownsInstance: false,
    });
    tracker.track('node_added', { node_id: 'person_pKqRz1sWm3' });
    tracker.track('node_added_to_prompt', { node_id: 'person_pKqRz1sWm3' });
    tracker.track('node_added', { node_id: 'person_other' });
    const [first, second, third] = client.capture.mock.calls.map(
      (call) => (call[1] as Record<string, unknown>).node_id,
    );
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('reports different pseudonyms for the same roster row in two sessions', () => {
    const rosterUid = 'person_pKqRz1sWm3';
    const capture = (distinctId: string) => {
      const client = { capture: vi.fn(), captureException: vi.fn() };
      createTracker({
        client: client as never,
        superProperties: baseSuperProps,
        distinctId,
        ownsInstance: false,
      }).track('node_added', { node_id: rosterUid });
      const props = client.capture.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      return props.node_id;
    };
    const first = capture('session-1');
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(capture('session-2'));
  });

  it('reuses a supplied session pseudonymiser across rebuilt trackers', () => {
    const pseudonymiseEntityId = createEntityIdPseudonymiser();
    const rosterUid = 'person_pKqRz1sWm3';
    const capture = () => {
      const client = { capture: vi.fn(), captureException: vi.fn() };
      createTracker({
        client: client as never,
        superProperties: baseSuperProps,
        distinctId: 'session-1',
        ownsInstance: false,
        pseudonymiseEntityId,
      }).track('node_added', { node_id: rosterUid });
      const props = client.capture.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      return props.node_id;
    };
    const first = capture();
    expect(first).toEqual(expect.any(String));
    expect(first).toBe(capture());
  });

  it('pseudonymises entity ids on captured exceptions too', () => {
    const client = { capture: vi.fn(), captureException: vi.fn() };
    const tracker = createTracker({
      client: client as never,
      superProperties: baseSuperProps,
      distinctId: 'session-1',
      ownsInstance: false,
    });
    tracker.captureException(new Error('boom'), {
      node_id: 'person_pKqRz1sWm3',
    });
    const props = client.captureException.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(props.node_id).toEqual(expect.any(String));
    expect(props.node_id).not.toBe('person_pKqRz1sWm3');
    expect(props.distinct_id).toBe('session-1');
  });

  it('track swallows thrown errors from the client', () => {
    const client = {
      capture: vi.fn(() => {
        throw new Error('posthog crashed');
      }),
      captureException: vi.fn(),
    };
    const tracker = createTracker({
      client: client as never,
      superProperties: baseSuperProps,
      distinctId: 'session-1',
      ownsInstance: false,
    });
    expect(() => tracker.track('x')).not.toThrow();
  });
});

describe('NULL_TRACKER', () => {
  it('track is a no-op', () => {
    expect(() => NULL_TRACKER.track('x', {})).not.toThrow();
  });
  it('captureException is a no-op', () => {
    expect(() => NULL_TRACKER.captureException(new Error('x'))).not.toThrow();
  });
});
