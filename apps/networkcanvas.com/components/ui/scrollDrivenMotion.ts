export const scrollDrivenRevealMotion = {
  distance: 48,
  duration: 0.9,
  easing: [0.22, 1, 0.36, 1] as [number, number, number, number],
  scrollLinked: true,
  scrollStagger: 1.5,
} as const;

export const heroScrollSpring = {
  stiffness: 120,
  damping: 24,
  mass: 0.35,
} as const;
