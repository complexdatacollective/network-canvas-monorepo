import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, RefObject } from 'react';

import useCanvas from './useCanvas';

type DrawFunction = (
  ctx: CanvasRenderingContext2D,
  time: number,
  canvasRef: RefObject<HTMLCanvasElement | null>,
) => void;

type DemoProps = {
  draw: DrawFunction;
  predraw?: DrawFunction;
  postdraw?: DrawFunction;
  width?: number;
  height?: number;
  background?: string;
};

const stageStyle = (
  width: number,
  height: number,
  background: string,
): CSSProperties => ({
  width,
  height,
  borderRadius: 12,
  overflow: 'hidden',
  background,
});

// A minimal wrapper that exists only so Storybook can render the hook —
// useCanvas is a hook, not a component, so it needs a host element.
const UseCanvasDemo = ({
  draw,
  predraw,
  postdraw,
  width = 720,
  height = 360,
  background = '#0f0f1a',
}: DemoProps) => {
  const ref = useCanvas(draw, predraw, postdraw);
  return (
    <div style={stageStyle(width, height, background)}>
      <canvas ref={ref} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

const cssSize = (ctx: CanvasRenderingContext2D) => {
  const ratio = window.devicePixelRatio || 1;
  return {
    w: ctx.canvas.width / ratio,
    h: ctx.canvas.height / ratio,
  };
};

const meta: Meta<typeof UseCanvasDemo> = {
  title: 'BackgroundBlobs/useCanvas',
  component: UseCanvasDemo,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    width: { control: { type: 'number', min: 200, max: 1200, step: 20 } },
    height: { control: { type: 'number', min: 120, max: 800, step: 20 } },
    background: { control: 'color' },
  },
  args: {
    width: 720,
    height: 360,
    background: '#0f0f1a',
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

// Animated circle following a Lissajous-like path.
export const BouncingBall: Story = {
  args: {
    draw: (ctx, time) => {
      const { w, h } = cssSize(ctx);
      const x = w / 2 + Math.sin(time / 600) * (w / 2 - 40);
      const y = h / 2 + Math.cos(time / 900) * (h / 2 - 40);
      ctx.fillStyle = '#00c9ff';
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();
    },
  },
};

// Twelve dots on a rotating ring; demonstrates `time` driving each frame.
export const OrbitingDots: Story = {
  args: {
    draw: (ctx, time) => {
      const { w, h } = cssSize(ctx);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) / 2.5;
      const count = 12;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + time / 1200;
        const x = cx + Math.cos(a) * radius;
        const y = cy + Math.sin(a) * radius;
        ctx.fillStyle = `hsl(${(i / count) * 360}, 80%, 60%)`;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
};

// Shows that the hook re-renders on resize: the bar reaches the right edge.
export const ResponsiveBar: Story = {
  args: {
    draw: (ctx, time) => {
      const { w, h } = cssSize(ctx);
      ctx.fillStyle = '#fc466b';
      ctx.fillRect(0, h / 2 - 12, w, 24);
      const x = ((time / 8) % w) - 30;
      ctx.fillStyle = '#3f5efb';
      ctx.fillRect(x, h / 2 - 24, 60, 48);
    },
  },
};

// Demonstrates overriding predraw to skip the default clear — produces a
// motion-trail effect by painting a translucent rect instead.
export const TrailingPredraw: Story = {
  args: {
    predraw: (ctx) => {
      ctx.save();
      const { w, h } = cssSize(ctx);
      ctx.fillStyle = 'rgba(15, 15, 26, 0.15)';
      ctx.fillRect(0, 0, w, h);
    },
    postdraw: (ctx) => ctx.restore(),
    draw: (ctx, time) => {
      const { w, h } = cssSize(ctx);
      const x = w / 2 + Math.sin(time / 500) * (w / 2 - 40);
      const y = h / 2 + Math.cos(time / 700) * (h / 2 - 40);
      ctx.fillStyle = '#92fe9d';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
    },
  },
};
