import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installLabelMetrics,
  uninstallLabelMetrics,
} from '../../__tests__/labelMetrics';
import { useFitText } from '../useFitText';

// Capacities under the simulated metrics: 33, 39 and 60 characters.
const STEPS = [
  'text-base line-clamp-3',
  'text-sm line-clamp-3',
  'text-xs line-clamp-4',
] as const;

const SINGLE_STEP = ['text-base line-clamp-3'] as const;

function Probe({
  text,
  enabled,
  steps = STEPS,
}: {
  text: string;
  enabled?: boolean;
  steps?: readonly string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref, stepIndex, isTruncated } = useFitText<HTMLSpanElement>({
    steps,
    containerRef,
    watch: text,
    enabled,
  });

  return (
    <div ref={containerRef}>
      <span ref={ref}>{text}</span>
      <output data-testid="state">{`${stepIndex}:${isTruncated}`}</output>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;

beforeEach(installLabelMetrics);
afterEach(uninstallLabelMetrics);

describe('useFitText', () => {
  it('keeps the largest rung when the text already fits', async () => {
    render(<Probe text={'a'.repeat(30)} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('steps down one rung when the text overflows the largest', async () => {
    render(<Probe text={'a'.repeat(36)} />);
    await waitFor(() => expect(state()).toBe('1:false'));
  });

  it('steps down to the smallest rung that fits', async () => {
    render(<Probe text={'a'.repeat(55)} />);
    await waitFor(() => expect(state()).toBe('2:false'));
  });

  it('reports truncation when the text overflows even the smallest rung', async () => {
    render(<Probe text={'a'.repeat(200)} />);
    await waitFor(() => expect(state()).toBe('2:true'));
  });

  it('re-fits when the text changes', async () => {
    const { rerender } = render(<Probe text={'a'.repeat(30)} />);
    await waitFor(() => expect(state()).toBe('0:false'));

    rerender(<Probe text={'a'.repeat(55)} />);
    await waitFor(() => expect(state()).toBe('2:false'));

    rerender(<Probe text={'a'.repeat(20)} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('still reports truncation for a single-rung ladder', async () => {
    render(<Probe text={'a'.repeat(200)} steps={SINGLE_STEP} />);
    await waitFor(() => expect(state()).toBe('0:true'));
  });

  it('does nothing when disabled', async () => {
    render(<Probe text={'a'.repeat(200)} enabled={false} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('resets when fitting is turned off', async () => {
    const { rerender } = render(<Probe text={'a'.repeat(200)} enabled />);
    await waitFor(() => expect(state()).toBe('2:true'));

    rerender(<Probe text={'a'.repeat(200)} enabled={false} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('applies the fitted rung to the element', async () => {
    render(<Probe text={'a'.repeat(55)} />);
    await waitFor(() => expect(state()).toBe('2:false'));
    expect(screen.getByText('a'.repeat(55))).toHaveClass(
      'text-xs',
      'line-clamp-4',
    );
  });
});
