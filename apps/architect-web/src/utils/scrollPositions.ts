const scrollPositions = new Map<string, number>();

export const getScrollPosition = (key: string) => scrollPositions.get(key);

export const setScrollPosition = (key: string, value: number) => {
  scrollPositions.set(key, value);
};

export const clearScrollPositions = () => {
  scrollPositions.clear();
};
