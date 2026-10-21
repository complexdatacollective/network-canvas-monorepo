import { describe, expect, it } from 'vitest';

import {
  frameShowsInterviewer8,
  readInterviewer8Message,
} from '../interviewer8Embed';

const ORIGIN = 'https://interviewer.example';

const windowAt = (href: string) =>
  ({ location: new URL(href) }) as unknown as Window;

const crossOriginWindow = {
  get location(): Location {
    throw new DOMException('Blocked a frame', 'SecurityError');
  },
} as unknown as Window;

describe('readInterviewer8Message', () => {
  const frame = windowAt(`${ORIGIN}/v8/interview/s1`);
  const event = (data: unknown, source: unknown = frame, origin = ORIGIN) =>
    ({ data, source, origin }) as MessageEvent;

  it("reads 'ready' and 'closed' from the frame at this origin", () => {
    expect(
      readInterviewer8Message(
        event({ type: 'interviewer8:ready' }),
        frame,
        ORIGIN,
      ),
    ).toBe('ready');
    expect(
      readInterviewer8Message(
        event({ type: 'interviewer8:closed' }),
        frame,
        ORIGIN,
      ),
    ).toBe('closed');
  });

  it('ignores another window, another origin, and anything else', () => {
    const ready = { type: 'interviewer8:ready' };
    expect(
      readInterviewer8Message(event(ready, windowAt(ORIGIN)), frame, ORIGIN),
    ).toBeNull();
    expect(
      readInterviewer8Message(
        event(ready, frame, 'https://elsewhere.example'),
        frame,
        ORIGIN,
      ),
    ).toBeNull();
    expect(readInterviewer8Message(event(ready), null, ORIGIN)).toBeNull();
    expect(
      readInterviewer8Message(
        event({ type: 'interviewer9:unlock' }),
        frame,
        ORIGIN,
      ),
    ).toBeNull();
    expect(
      readInterviewer8Message(event('interviewer8:ready'), frame, ORIGIN),
    ).toBeNull();
  });
});

describe('frameShowsInterviewer8', () => {
  it('is true only for a page under /v8/ at this origin', () => {
    expect(
      frameShowsInterviewer8(windowAt(`${ORIGIN}/v8/interview/s1`), ORIGIN),
    ).toBe(true);
    expect(
      frameShowsInterviewer8(windowAt(`${ORIGIN}/interview/s1`), ORIGIN),
    ).toBe(false);
    expect(frameShowsInterviewer8(windowAt('about:blank'), ORIGIN)).toBe(false);
    expect(
      frameShowsInterviewer8(
        windowAt('https://elsewhere.example/v8/interview/s1'),
        ORIGIN,
      ),
    ).toBe(false);
    expect(frameShowsInterviewer8(crossOriginWindow, ORIGIN)).toBe(false);
    expect(frameShowsInterviewer8(null, ORIGIN)).toBe(false);
  });
});
