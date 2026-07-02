'use client';

import { memo, useMemo } from 'react';

import Canvas from './Canvas';
import { NCBlob } from './NCBlob';

export const defaultGradients: ReadonlyArray<readonly [string, string]> = [
  ['rgb(237,0,140)', 'rgb(226,33,91)'],
  ['#00c9ff', '#92fe9d'],
  ['#fc466b', '#3f5efb'],
  ['#d53369', '#daae51'],
  ['#3f2b96', '#a8c0ff'],
  ['rgb(0, 201, 162)', 'rgb(0, 160, 129)'],
  ['rgb(107, 114, 236)', 'rgb(58, 58, 117)'],
  ['rgb(242, 183, 0)', 'rgb(247,137,30)'],
  ['rgb(15, 178, 226)', 'rgb(15, 112, 255)'],
  ['rgb(45, 41, 285)', 'rgb(58,58,217)'],
];

const DEFAULT_SPEED_FACTOR = 1;

export type BackgroundBlobsProps = {
  large?: number;
  medium?: number;
  small?: number;
  speedFactor?: number;
  compositeOperation?: GlobalCompositeOperation;
  filter?: CanvasFilters['filter'];
  palette?: ReadonlyArray<readonly [string, string]>;
};

const BackgroundBlobs = memo(
  ({
    large = 2,
    medium = 4,
    small = 4,
    speedFactor = DEFAULT_SPEED_FACTOR,
    compositeOperation = 'source-over',
    filter = '',
    palette,
  }: BackgroundBlobsProps) => {
    const blobs = useMemo(() => {
      const activePalette =
        palette && palette.length > 0 ? palette : defaultGradients;
      return [
        Array.from(
          { length: large },
          () => new NCBlob(3, speedFactor, activePalette),
        ),
        Array.from(
          { length: medium },
          () => new NCBlob(2, speedFactor, activePalette),
        ),
        Array.from(
          { length: small },
          () => new NCBlob(1, speedFactor, activePalette),
        ),
      ];
    }, [large, medium, small, speedFactor, palette]);

    const drawBlobs = (ctx: CanvasRenderingContext2D, time: number) => {
      ctx.globalCompositeOperation = compositeOperation;
      ctx.filter = filter;
      for (const layer of blobs) {
        for (const blob of layer) {
          blob.render(ctx, time);
        }
      }
    };

    return <Canvas draw={drawBlobs} />;
  },
);

BackgroundBlobs.displayName = 'BackgroundBlobs';

export default BackgroundBlobs;
