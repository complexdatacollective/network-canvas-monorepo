const summerUpdateEasing = [0.22, 1, 0.36, 1] as [
  number,
  number,
  number,
  number,
];

export const summerUpdateRevealMotion = {
  distance: 48,
  duration: 0.9,
  easing: summerUpdateEasing,
  scrollLinked: true,
} as const;
