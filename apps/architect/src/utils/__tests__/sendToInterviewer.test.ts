import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

vi.mock('../interviewerHandoff', () => ({
  openInterviewerTab: vi.fn(),
  deliverToInterviewer: vi.fn(),
}));

vi.mock('../bundleProtocol', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../bundleProtocol')>()),
  bundleProtocol: vi.fn(),
}));

vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

const { openInterviewerTab, deliverToInterviewer } =
  await import('../interviewerHandoff');
const { bundleProtocol, UnresolvedAssetsError } =
  await import('../bundleProtocol');
const { posthog } = await import('~/analytics');
const { sendProtocolToInterviewer } = await import('../sendToInterviewer');

const PROTOCOL = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {},
  stages: [],
} as unknown as CurrentProtocol;

const read = () =>
  Promise.resolve({ protocol: PROTOCOL, protocolId: 'protocol-1' });

let tab: { window: { close: ReturnType<typeof vi.fn> }; origin: string };
const openDialog = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  tab = { window: { close: vi.fn() }, origin: 'http://localhost:5180' };
  vi.mocked(openInterviewerTab).mockReturnValue(
    tab as unknown as ReturnType<typeof openInterviewerTab>,
  );
  vi.mocked(bundleProtocol).mockResolvedValue(new Blob(['zip']));
  vi.mocked(deliverToInterviewer).mockResolvedValue('received');
});

describe('sendProtocolToInterviewer', () => {
  it('bundles the protocol and hands it to the tab it opened', async () => {
    await expect(sendProtocolToInterviewer(openDialog, read)).resolves.toBe(
      true,
    );
    expect(bundleProtocol).toHaveBeenCalledWith(PROTOCOL, 'protocol-1');
    expect(deliverToInterviewer).toHaveBeenCalledWith(tab, {
      blob: expect.any(Blob),
      fileName: 'Study.netcanvas',
    });
    expect(openDialog).not.toHaveBeenCalled();
    expect(posthog.capture).toHaveBeenCalledWith(
      'protocol_sent_to_interviewer',
      { stage_count: 0 },
    );
  });

  it('opens the tab before anything is awaited', () => {
    void sendProtocolToInterviewer(openDialog, read);
    // Still inside the click: a tab opened after an await would be blocked.
    expect(openInterviewerTab).toHaveBeenCalledTimes(1);
  });

  it('explains a blocked tab without bundling anything', async () => {
    vi.mocked(openInterviewerTab).mockReturnValue(null);
    await expect(sendProtocolToInterviewer(openDialog, read)).resolves.toBe(
      false,
    );
    expect(bundleProtocol).not.toHaveBeenCalled();
    expect(openDialog).toHaveBeenCalledTimes(1);
  });

  it('closes the tab and explains a protocol that cannot be bundled', async () => {
    vi.mocked(bundleProtocol).mockRejectedValue(
      new UnresolvedAssetsError(['map.png']),
    );
    await expect(sendProtocolToInterviewer(openDialog, read)).resolves.toBe(
      false,
    );
    expect(tab.window.close).toHaveBeenCalled();
    expect(deliverToInterviewer).not.toHaveBeenCalled();
    expect(openDialog).toHaveBeenCalledTimes(1);
  });

  it('explains when Interviewer was not reached', async () => {
    vi.mocked(deliverToInterviewer).mockResolvedValue('not-reached');
    await expect(sendProtocolToInterviewer(openDialog, read)).resolves.toBe(
      false,
    );
    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
