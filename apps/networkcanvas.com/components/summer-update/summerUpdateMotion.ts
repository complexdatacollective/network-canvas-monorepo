import { scrollDrivenRevealMotion } from '~/components/ui/scrollDrivenMotion';

export const summerUpdateRevealMotion = {
  ...scrollDrivenRevealMotion,
  scrollStagger: 1,
} as const;
