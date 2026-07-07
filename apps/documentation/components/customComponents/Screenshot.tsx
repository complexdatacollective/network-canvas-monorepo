'use client';

import {
  APP_LABELS,
  INTERVIEWER_LABELS,
} from '~/components/customComponents/appVariants';
import {
  type AppAxis,
  useSelectedApp,
} from '~/components/customComponents/useSelectedApp';

// Each axis has two switcher variants, each with its own screenshot directory.
// The reader sees `primary` until they switch to `secondary`.
const AXIS = {
  architect: {
    primary: { variant: APP_LABELS.current, dir: 'architect-guide' },
    secondary: { variant: APP_LABELS.classic, dir: 'architect-classic-guide' },
  },
  interviewer: {
    primary: { variant: INTERVIEWER_LABELS.current, dir: 'interviewer-guide' },
    secondary: { variant: INTERVIEWER_LABELS.classic, dir: 'sample-protocol' },
  },
} as const;

type ScreenshotProps = {
  axis: AppAxis;
  name: string;
  alt?: string;
};

export const Screenshot = ({ axis, name, alt = '' }: ScreenshotProps) => {
  const [selectedApp] = useSelectedApp(axis);
  const axisConfig = AXIS[axis];
  if (!axisConfig) {
    throw new Error(
      `Screenshot: invalid axis "${axis}". Expected one of: ${Object.keys(
        AXIS,
      ).join(', ')}.`,
    );
  }
  const { primary, secondary } = axisConfig;
  const dir = selectedApp === secondary.variant ? secondary.dir : primary.dir;
  const src = `/assets/img/${dir}/${name}.png`;

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="my-10 w-full px-8"
    >
      <img src={src} alt={alt} className="w-full" />
    </a>
  );
};
