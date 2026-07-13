import { seedToRng } from '../Pattern/seed';

export const NETWORK_WEAVE_WIDTH = 1600;
export const NETWORK_WEAVE_HEIGHT = 900;

export type NetworkWeaveFocus = {
  x?: number;
  y?: number;
  radius?: number;
};

export type ResolvedNetworkWeaveFocus = {
  x: number;
  y: number;
  radius: number;
};

export type NetworkWeaveOrientation = 'horizontal' | 'vertical';

type NormalizedPoint = {
  axis: number;
  cross: number;
};

type NetworkWeavePoint = {
  x: number;
  y: number;
};

type NetworkWeavePath = {
  d: string;
  colorIndex: number;
  opacity: number;
  width: number;
};

type NetworkWeaveRibbon = {
  d: string;
  guideD: string;
  centerlineD: string;
  colorIndex: number;
  gradientStart: NetworkWeavePoint;
  gradientEnd: NetworkWeavePoint;
  phase: number;
};

type NetworkWeaveScene = {
  tributaries: NetworkWeavePath[];
  ribbons: NetworkWeaveRibbon[];
};

type RibbonPoint = {
  position: NormalizedPoint;
  halfWidth: number;
};

type RibbonProfile = {
  points: [RibbonPoint, RibbonPoint, RibbonPoint, RibbonPoint];
  colorIndex: number;
  laneCross: number;
};

export const clampNetworkWeaveValue = (
  value: number,
  minimum: number,
  maximum: number,
  fallback = minimum,
) =>
  Math.min(
    maximum,
    Math.max(minimum, Number.isFinite(value) ? value : fallback),
  );

export const formatNetworkWeaveValue = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

export const resolveNetworkWeaveFocus = (
  focus?: NetworkWeaveFocus,
): ResolvedNetworkWeaveFocus => {
  const x = clampNetworkWeaveValue(focus?.x ?? 0.5, 0.3, 0.7, 0.5);
  const y = clampNetworkWeaveValue(focus?.y ?? 0.45, 0.3, 0.7, 0.45);
  const maximumRadius = Math.min(0.28, x - 0.1, 0.9 - x, y - 0.1, 0.9 - y);

  return {
    x,
    y,
    radius: clampNetworkWeaveValue(
      focus?.radius ?? 0.22,
      0.08,
      maximumRadius,
      0.22,
    ),
  };
};

const pointToString = ({ x, y }: NetworkWeavePoint) =>
  `${formatNetworkWeaveValue(x)} ${formatNetworkWeaveValue(y)}`;

const createProjector = (
  orientation: NetworkWeaveOrientation,
  reverse: boolean,
) => {
  return ({ axis, cross }: NormalizedPoint): NetworkWeavePoint => {
    const directedAxis = reverse ? 1 - axis : axis;
    if (orientation === 'horizontal') {
      return {
        x: directedAxis * NETWORK_WEAVE_WIDTH,
        y: cross * NETWORK_WEAVE_HEIGHT,
      };
    }

    return {
      x: cross * NETWORK_WEAVE_WIDTH,
      y: directedAxis * NETWORK_WEAVE_HEIGHT,
    };
  };
};

const createCubicPath = (
  start: NetworkWeavePoint,
  firstControl: NetworkWeavePoint,
  secondControl: NetworkWeavePoint,
  end: NetworkWeavePoint,
) =>
  `M ${pointToString(start)} C ${pointToString(firstControl)} ${pointToString(secondControl)} ${pointToString(end)}`;

const distribute = (count: number, start: number, end: number) => {
  if (count === 1) return [(start + end) / 2];
  return Array.from(
    { length: count },
    (_, index) => start + (index / (count - 1)) * (end - start),
  );
};

const createLaneCrosses = (
  strands: number,
  focusCross: number,
  focusRadius: number,
) => {
  const topCount = Math.ceil(strands / 2);
  const bottomCount = strands - topCount;
  const topInner = clampNetworkWeaveValue(
    focusCross - focusRadius - 0.065,
    0.14,
    0.36,
  );
  const bottomInner = clampNetworkWeaveValue(
    focusCross + focusRadius + 0.065,
    0.64,
    0.86,
  );

  return [
    ...distribute(topCount, 0.08, topInner),
    ...distribute(bottomCount, bottomInner, 0.92),
  ];
};

const offsetRibbonPoint = (
  point: RibbonPoint,
  direction: -1 | 1,
  project: (point: NormalizedPoint) => NetworkWeavePoint,
) =>
  project({
    axis: point.position.axis,
    cross: point.position.cross + point.halfWidth * direction,
  });

const createRibbonShape = (
  profile: RibbonProfile,
  project: (point: NormalizedPoint) => NetworkWeavePoint,
) => {
  const upper = profile.points.map((point) =>
    offsetRibbonPoint(point, -1, project),
  );
  const lower = profile.points.map((point) =>
    offsetRibbonPoint(point, 1, project),
  );
  const [u0, u1, u2, u3] = upper;
  const [l0, l1, l2, l3] = lower;

  if (!u0 || !u1 || !u2 || !u3) return '';
  if (!l0 || !l1 || !l2 || !l3) return '';

  return [
    `M ${pointToString(u0)}`,
    `C ${pointToString(u1)} ${pointToString(u2)} ${pointToString(u3)}`,
    `L ${pointToString(l3)}`,
    `C ${pointToString(l2)} ${pointToString(l1)} ${pointToString(l0)}`,
    'Z',
  ].join(' ');
};

const createRibbonProfiles = ({
  laneCrosses,
  focusAxis,
  focusCross,
  focusRadius,
  colorCount,
  orientation,
  flare,
}: {
  laneCrosses: number[];
  focusAxis: number;
  focusCross: number;
  focusRadius: number;
  colorCount: number;
  orientation: NetworkWeaveOrientation;
  flare: number;
}): RibbonProfile[] => {
  const mergeAxis = clampNetworkWeaveValue(
    focusAxis - focusRadius - 0.13,
    0.12,
    0.48,
  );
  const firstControlAxis = clampNetworkWeaveValue(
    focusAxis - focusRadius * 0.12,
    mergeAxis + 0.18,
    0.68,
  );
  const secondControlAxis = 0.96;
  const crossDimension =
    orientation === 'horizontal' ? NETWORK_WEAVE_HEIGHT : NETWORK_WEAVE_WIDTH;
  const width = (pixels: number) => pixels / crossDimension;

  return laneCrosses.map((laneCross, laneIndex) => {
    const side = laneCross < focusCross ? -1 : 1;
    const innerBoundary = focusCross + side * (focusRadius + 0.055);
    const bypassCross = laneCross + (innerBoundary - laneCross) * 0.74;
    const mergeCross =
      focusCross + (laneIndex - (laneCrosses.length - 1) / 2) * 0.014;
    const bandCross = (laneIndex + 0.5) / laneCrosses.length;
    const positionalFlare = Math.min(1, flare);
    const endCross = laneCross + (bandCross - laneCross) * positionalFlare;
    const compactEndWidth = width(0.45);
    const flaredEndWidth = (0.5 / laneCrosses.length) * 1.1;
    const endWidth =
      compactEndWidth + (flaredEndWidth - compactEndWidth) * flare;
    const secondControlCross =
      laneCross + (endCross - laneCross) * positionalFlare * 0.16;
    const secondControlWidth =
      width(3.2) + (endWidth - width(3.2)) * flare * 0.06;

    return {
      points: [
        {
          position: { axis: mergeAxis, cross: mergeCross },
          halfWidth: width(3.2),
        },
        {
          position: {
            axis: firstControlAxis,
            cross: bypassCross,
          },
          halfWidth: width(13),
        },
        {
          position: {
            axis: secondControlAxis,
            cross: secondControlCross,
          },
          halfWidth: secondControlWidth,
        },
        {
          position: { axis: 1.04, cross: endCross },
          halfWidth: endWidth,
        },
      ],
      colorIndex: laneIndex % colorCount,
      laneCross: endCross,
    };
  });
};

const createRibbon = (
  profile: RibbonProfile,
  index: number,
  ribbonCount: number,
  project: (point: NormalizedPoint) => NetworkWeavePoint,
): NetworkWeaveRibbon => {
  const minimumGuideWidth = profile.points[0].halfWidth * 0.24;
  const createGuidePoint = (point: RibbonPoint): RibbonPoint => ({
    position: point.position,
    halfWidth: Math.max(
      minimumGuideWidth,
      Math.min(point.halfWidth * 0.06, 0.012),
    ),
  });
  const guideProfile: RibbonProfile = {
    points: [
      createGuidePoint(profile.points[0]),
      createGuidePoint(profile.points[1]),
      createGuidePoint(profile.points[2]),
      createGuidePoint(profile.points[3]),
    ],
    colorIndex: profile.colorIndex,
    laneCross: profile.laneCross,
  };
  const centerlinePoints = profile.points.map(({ position }) =>
    project(position),
  );
  const [start, firstControl, secondControl, end] = centerlinePoints;
  const fallback = project({ axis: 0.5, cross: profile.laneCross });
  const safePoints: [
    NetworkWeavePoint,
    NetworkWeavePoint,
    NetworkWeavePoint,
    NetworkWeavePoint,
  ] = [
    start ?? fallback,
    firstControl ?? fallback,
    secondControl ?? fallback,
    end ?? fallback,
  ];
  return {
    d: createRibbonShape(profile, project),
    guideD: createRibbonShape(guideProfile, project),
    centerlineD: createCubicPath(
      safePoints[0],
      safePoints[1],
      safePoints[2],
      safePoints[3],
    ),
    colorIndex: profile.colorIndex,
    gradientStart: safePoints[0],
    gradientEnd: safePoints[3],
    phase: index / ribbonCount,
  };
};

const createNetworkWeaveScene = ({
  seed,
  complexity,
  strands,
  colorCount,
  focus,
  orientation,
  reverse,
  flare,
}: {
  seed: string;
  complexity: number;
  strands: number;
  colorCount: number;
  focus: ResolvedNetworkWeaveFocus;
  orientation: NetworkWeaveOrientation;
  reverse: boolean;
  flare: number;
}): NetworkWeaveScene => {
  const rng = seedToRng(`${seed}::network-weave`);
  const project = createProjector(orientation, reverse);
  const focusAxis =
    orientation === 'horizontal'
      ? reverse
        ? 1 - focus.x
        : focus.x
      : reverse
        ? 1 - focus.y
        : focus.y;
  const focusCross = orientation === 'horizontal' ? focus.y : focus.x;
  const laneCrosses = createLaneCrosses(strands, focusCross, focus.radius);
  const profiles = createRibbonProfiles({
    laneCrosses,
    focusAxis,
    focusCross,
    focusRadius: focus.radius,
    colorCount,
    orientation,
    flare,
  });
  const mergeAxis = profiles[0]?.points[0].position.axis ?? 0.22;
  const tributaries = Array.from(
    { length: complexity },
    (_, index): NetworkWeavePath => {
      const laneIndex = index % strands;
      const profile = profiles[laneIndex] ?? profiles[0];
      const merge = profile?.points[0].position ?? {
        axis: mergeAxis,
        cross: 0.5,
      };
      const outgoingControl = profile?.points[1].position ?? {
        axis: merge.axis + 0.35,
        cross: merge.cross,
      };
      const origin = {
        axis: -0.08 - rng() * 0.28,
        cross: -0.12 + rng() * 1.24,
      };
      const axisSpan = merge.axis - origin.axis;
      const start = project(origin);
      const firstControl = project({
        axis: origin.axis + axisSpan * 0.42,
        cross:
          origin.cross +
          (merge.cross - origin.cross) * 0.08 +
          (rng() - 0.5) * 0.055,
      });
      const secondControl = project({
        axis: merge.axis - (outgoingControl.axis - merge.axis) * 0.18,
        cross: merge.cross - (outgoingControl.cross - merge.cross) * 0.18,
      });
      const end = project(merge);

      return {
        d: createCubicPath(start, firstControl, secondControl, end),
        colorIndex: laneIndex % colorCount,
        opacity: 0.2 + rng() * 0.16,
        width: 2.1 + rng() * 2,
      };
    },
  );

  return {
    tributaries,
    ribbons: profiles.map((profile, index) =>
      createRibbon(profile, index, profiles.length, project),
    ),
  };
};

export default createNetworkWeaveScene;
