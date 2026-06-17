export type Ratio = '1:1' | '4:3' | '16:9';

export type ImageVariant = {
  /** Intrinsic pixel width of this variant (srcset `w` descriptor). */
  w: number;
  /** Intrinsic pixel height of this variant. */
  h: number;
  url: string;
};

export type RatioImages = {
  /** Width variants, sorted ascending. The last entry is the largest. */
  variants: ImageVariant[];
};

export type ManifestEntry = Partial<Record<Ratio, RatioImages>>;
