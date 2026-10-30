'use client';

import { Cloud, Code, Database, User, type LucideIcon } from 'lucide-react';
import { useId } from 'react';

import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import {
  backOut,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  CheckStamp,
  Click,
  GroundShadow,
  Icon,
  pivot,
  TextBar,
  type Point,
} from './parts';

// A service's sign-in page: the cursor clicks the GitHub button and the page
// turns into the reader's signed-in account. With `beside`, this walkthrough
// sits in a window to its left, as the reader is asked to arrange them.
const CLICK_AT = 1.5;
const SWAP_AT = 1.9;
const STAMP_AT = 2.4;
const END = 3.1;

type Service = {
  name: string;
  url: string;
  icon: LucideIcon;
  fill: string;
  beside?: true;
};

function SignInScene({ name, url, icon, fill, beside }: Service) {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const frame = beside
    ? { x: 520, y: 50, width: 600, height: 340 }
    : { x: 330, y: 50, width: 540, height: 340 };
  const content = browserContent(frame);
  const midX = (content.x + content.right) / 2;
  const button = { x: midX - 160, y: content.y + 170, width: 320, height: 56 };
  const target: Point = [midX + 40, button.y + button.height / 2];
  const win = backOut(segment(t, beside ? 0.25 : 0, 0.5));
  const side = backOut(segment(t, 0, 0.5));
  const swap = segment(t, SWAP_AT, 0.25);
  const account = backOut(segment(t, SWAP_AT + 0.1, 0.5));
  const pressed =
    segment(t, CLICK_AT, 0.1) * (1 - segment(t, CLICK_AT + 0.2, 0.2));
  const guide = { x: 70, y: 100, width: 380, height: 270 };
  const guideContent = browserContent(guide);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      {beside ? (
        <>
          <GroundShadow cx={guide.x + guide.width / 2} cy={415} rx={180} />
          <g
            transform={`translate(0 ${bob}) ${pivot(guide.x + guide.width / 2, guide.y + guide.height / 2, side)}`}
          >
            <BrowserWindow
              frame={guide}
              url="documentation.networkcanvas.com"
              clipId={`${id}-guide`}
              urlWidth={250}
            >
              <rect
                x={guideContent.x}
                y={guideContent.y}
                width={guideContent.right - guideContent.x}
                height={110}
                className="fill-sea-serpent/25"
              />
              {[0, 1, 2, 3].map((index) => (
                <rect
                  key={index}
                  x={guideContent.x + 24 + index * 82}
                  y={guideContent.y + 136}
                  width={72}
                  height={8}
                  rx={4}
                  className={
                    index === 0 ? 'fill-sea-serpent' : 'fill-navy-taupe/15'
                  }
                />
              ))}
              <TextBar
                x={guideContent.x + 24}
                y={guideContent.y + 168}
                width={260}
              />
              <rect
                x={guideContent.right - 140}
                y={guideContent.bottom - 52}
                width={116}
                height={36}
                rx={18}
                className={cx('fill-sea-serpent', outline)}
                strokeWidth={4}
              />
            </BrowserWindow>
          </g>
        </>
      ) : null}
      <GroundShadow
        cx={frame.x + frame.width / 2}
        cy={415}
        rx={frame.width / 2}
      />
      <g
        transform={`translate(0 ${bob}) ${pivot(frame.x + frame.width / 2, frame.y + frame.height / 2, win)}`}
      >
        <BrowserWindow
          frame={frame}
          url={url}
          clipId={`${id}-window`}
          urlWidth={260}
        >
          <g opacity={1 - swap}>
            <circle
              cx={midX}
              cy={content.y + 62}
              r={34}
              className={cx(fill, outline)}
              strokeWidth={5}
            />
            <Icon
              icon={icon}
              x={midX}
              y={content.y + 62}
              size={34}
              className="text-white"
            />
            <text
              x={midX}
              y={content.y + 138}
              textAnchor="middle"
              fontSize={26}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              {`Sign in to ${name}`}
            </text>
            <g transform={`translate(0 ${pressed * 3})`}>
              <rect
                {...button}
                rx={28}
                className={cx(
                  pressed > 0 ? 'fill-purple-pizazz/20' : 'fill-white',
                  outline,
                )}
                strokeWidth={5}
              />
              <Icon
                icon={Code}
                x={button.x + 44}
                y={button.y + button.height / 2}
                size={26}
              />
              <text
                x={midX + 18}
                y={button.y + 36}
                textAnchor="middle"
                fontSize={20}
                fontWeight={900}
                className="fill-navy-taupe"
              >
                Continue with GitHub
              </text>
            </g>
          </g>
          {account > 0 ? (
            <g transform={pivot(midX, content.y + 120, account)}>
              <circle
                cx={midX}
                cy={content.y + 100}
                r={52}
                className={cx('fill-purple-pizazz', outline)}
                strokeWidth={6}
              />
              <Icon
                icon={User}
                x={midX}
                y={content.y + 100}
                size={54}
                className="text-white"
              />
              <TextBar x={midX - 90} y={content.y + 196} width={180} />
              <TextBar
                x={midX - 60}
                y={content.y + 226}
                width={120}
                className="stroke-navy-taupe/12"
              />
            </g>
          ) : null}
          <Click
            t={t}
            from={[content.right - 40, content.bottom + 10]}
            to={target}
            at={CLICK_AT}
            leave={SWAP_AT}
          />
        </BrowserWindow>
      </g>
      <CheckStamp
        x={frame.x + frame.width - 30}
        y={frame.y + 40 + bob}
        k={backOut(segment(t, STAMP_AT, 0.5))}
        t={t}
      />
    </svg>
  );
}

export const GitHubSignInScene = () => (
  <SignInScene
    name="GitHub"
    url="github.com/login"
    icon={Code}
    fill="fill-purple-pizazz"
    beside
  />
);

export const NeonSignInScene = () => (
  <SignInScene
    name="Neon"
    url="neon.com"
    icon={Database}
    fill="fill-sea-green"
  />
);

export const NetlifySignInScene = () => (
  <SignInScene
    name="Netlify"
    url="app.netlify.com/start"
    icon={Cloud}
    fill="fill-cerulean-blue"
  />
);
