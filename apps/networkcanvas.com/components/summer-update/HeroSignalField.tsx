'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

const TARGET_SELECTOR = '[data-homepage-weave-target]';
const COLOR_PROPERTIES = [
  '--color-neon-coral',
  '--color-sea-serpent',
  '--color-mustard',
  '--color-sea-green',
] as const;
const MAX_PIXEL_RATIO = 1.5;
const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const VERTEX_SHADER = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform vec2 u_focus;
  uniform vec2 u_focus_size;
  uniform vec2 u_pointer;
  uniform float u_time;
  uniform float u_scroll;
  uniform vec3 u_color_0;
  uniform vec3 u_color_1;
  uniform vec3 u_color_2;
  uniform vec3 u_color_3;

  float gaussian(float value, float width) {
    float safeWidth = max(width, 0.0001);
    return exp(-(value * value) / (safeWidth * safeWidth));
  }

  float routeProgress(vec2 point, float side) {
    return clamp((point.x * side - 1.08) / 2.25, 0.0, 1.0);
  }

  float routeY(
    float progress,
    float lane,
    float bend,
    float phase
  ) {
    return lane +
      bend *
      sin(progress * 4.3 + phase) *
      (0.35 + progress * 0.65);
  }

  float routeMask(
    vec2 point,
    float side,
    float lane,
    float bend,
    float phase,
    float width
  ) {
    float sideDistance = point.x * side;
    float progress = routeProgress(point, side);
    float pathY = routeY(progress, lane, bend, phase);
    float bounds =
      smoothstep(0.98, 1.12, sideDistance) *
      (1.0 - smoothstep(3.05, 3.35, sideDistance));
    float dashWave = 0.5 + 0.5 * sin(progress * 34.0 + phase * 2.0);
    float dashes = mix(
      0.18,
      1.0,
      smoothstep(0.18, 0.7, dashWave)
    );

    return gaussian(point.y - pathY, width) * bounds * dashes;
  }

  float signalNode(
    vec2 pixelPoint,
    vec2 localPosition,
    vec2 focusHalfSize,
    float radius
  ) {
    vec2 pixelPosition = localPosition * focusHalfSize;
    return gaussian(length(pixelPoint - pixelPosition), radius);
  }

  float packetSignal(
    vec2 pixelPoint,
    vec2 focusHalfSize,
    float side,
    float lane,
    float bend,
    float phase,
    float intro,
    float start,
    float end
  ) {
    float active =
      smoothstep(start, start + 0.045, intro) *
      (1.0 - smoothstep(end - 0.055, end, intro));
    float progress = 1.0 - smoothstep(start, end, intro);
    vec2 position = vec2(
      side * (1.08 + progress * 2.25),
      routeY(progress, lane, bend, phase)
    );

    return signalNode(
      pixelPoint,
      position,
      focusHalfSize,
      5.2
    ) * active;
  }

  void selectStronger(
    float candidate,
    vec3 candidateColor,
    inout float strongest,
    inout vec3 color
  ) {
    if (candidate > strongest) {
      strongest = candidate;
      color = candidateColor;
    }
  }

  void main() {
    vec2 focusHalfSize = max(
      u_focus_size * 0.5,
      vec2(60.0, 20.0)
    );
    vec2 pixelPoint = gl_FragCoord.xy - u_focus;
    vec2 point = pixelPoint / focusHalfSize;
    point -= u_pointer * 0.006;

    float intro = clamp(u_time / 2.05, 0.0, 1.0);
    float introVisibility = smoothstep(0.05, 0.14, intro);
    float settled = smoothstep(0.72, 1.0, intro);
    float routeStrength = mix(0.12, 0.004, settled);
    float pathWidth = max(
      0.022,
      1.55 / max(focusHalfSize.y, 1.0)
    );

    float route0 = routeMask(
      point,
      -1.0,
      -1.12,
      0.46,
      0.2,
      pathWidth
    );
    float route1 = routeMask(
      point,
      -1.0,
      1.18,
      -0.4,
      1.7,
      pathWidth
    );
    float route2 = routeMask(
      point,
      1.0,
      -1.28,
      -0.42,
      3.3,
      pathWidth
    );
    float route3 = routeMask(
      point,
      1.0,
      1.08,
      0.44,
      4.8,
      pathWidth
    );

    float packet0 = packetSignal(
      pixelPoint,
      focusHalfSize,
      -1.0,
      -1.12,
      0.46,
      0.2,
      intro,
      0.16,
      0.44
    );
    float packet1 = packetSignal(
      pixelPoint,
      focusHalfSize,
      -1.0,
      1.18,
      -0.4,
      1.7,
      intro,
      0.22,
      0.5
    );
    float packet2 = packetSignal(
      pixelPoint,
      focusHalfSize,
      1.0,
      -1.28,
      -0.42,
      3.3,
      intro,
      0.28,
      0.56
    );
    float packet3 = packetSignal(
      pixelPoint,
      focusHalfSize,
      1.0,
      1.08,
      0.44,
      4.8,
      intro,
      0.34,
      0.62
    );

    float arrival =
      smoothstep(0.5, 0.68, intro) *
      (1.0 - smoothstep(0.76, 0.94, intro));
    float idleGlint =
      mix(0.006, 0.01, 0.5 + 0.5 * sin(u_time * 0.72));
    float glint0 = signalNode(
      pixelPoint,
      vec2(-1.08, routeY(0.0, -1.12, 0.46, 0.2)),
      focusHalfSize,
      5.5
    );
    float glint1 = signalNode(
      pixelPoint,
      vec2(-1.08, routeY(0.0, 1.18, -0.4, 1.7)),
      focusHalfSize,
      5.5
    );
    float glint2 = signalNode(
      pixelPoint,
      vec2(1.08, routeY(0.0, -1.28, -0.42, 3.3)),
      focusHalfSize,
      5.5
    );
    float glint3 = signalNode(
      pixelPoint,
      vec2(1.08, routeY(0.0, 1.08, 0.44, 4.8)),
      focusHalfSize,
      5.5
    );

    float glintStrength = arrival * 0.32 + idleGlint * settled;
    float weight0 =
      route0 * routeStrength * introVisibility +
      packet0 * 0.48 +
      glint0 * glintStrength;
    float weight1 =
      route1 * routeStrength * introVisibility +
      packet1 * 0.48 +
      glint1 * glintStrength;
    float weight2 =
      route2 * routeStrength * introVisibility +
      packet2 * 0.48 +
      glint2 * glintStrength;
    float weight3 =
      route3 * routeStrength * introVisibility +
      packet3 * 0.48 +
      glint3 * glintStrength;

    vec3 color = u_color_0;
    float strongest = weight0;
    selectStronger(weight1, u_color_1, strongest, color);
    selectStronger(weight2, u_color_2, strongest, color);
    selectStronger(weight3, u_color_3, strongest, color);

    float scrollVisibility = 1.0 - smoothstep(0.02, 0.3, u_scroll);
    float alpha = min(strongest, 0.46) * scrollVisibility;
    if (alpha < 0.001) discard;

    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

type RgbColor = readonly [number, number, number];

function compileShader(
  context: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = context.createShader(type);
  if (!shader) return null;

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    context.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(context: WebGLRenderingContext) {
  const vertexShader = compileShader(
    context,
    context.VERTEX_SHADER,
    VERTEX_SHADER,
  );
  const fragmentShader = compileShader(
    context,
    context.FRAGMENT_SHADER,
    FRAGMENT_SHADER,
  );
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) context.deleteShader(vertexShader);
    if (fragmentShader) context.deleteShader(fragmentShader);
    return null;
  }

  const program = context.createProgram();
  if (!program) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    return null;
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    context.deleteProgram(program);
    return null;
  }

  return program;
}

function resolveThemeColor(
  context: CanvasRenderingContext2D,
  property: (typeof COLOR_PROPERTIES)[number],
): RgbColor | null {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(property)
    .trim();
  if (!value) return null;

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  const red = pixel[0];
  const green = pixel[1];
  const blue = pixel[2];
  const alpha = pixel[3];
  if (
    red === undefined ||
    green === undefined ||
    blue === undefined ||
    alpha === undefined ||
    alpha === 0
  ) {
    return null;
  }

  return [red / 255, green / 255, blue / 255];
}

export function HeroSignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const motionEnabled = hasHydrated && shouldReduceMotion === false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !motionEnabled) return undefined;

    const context = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!context) return undefined;

    const program = createProgram(context);
    if (!program) return undefined;

    const positionLocation = context.getAttribLocation(program, 'a_position');
    const focusLocation = context.getUniformLocation(program, 'u_focus');
    const focusSizeLocation = context.getUniformLocation(
      program,
      'u_focus_size',
    );
    const pointerLocation = context.getUniformLocation(program, 'u_pointer');
    const timeLocation = context.getUniformLocation(program, 'u_time');
    const scrollLocation = context.getUniformLocation(program, 'u_scroll');
    const colorLocations = COLOR_PROPERTIES.map((_, index) =>
      context.getUniformLocation(program, `u_color_${index}`),
    );
    const positionBuffer = context.createBuffer();
    if (positionLocation < 0 || !positionBuffer) {
      context.deleteProgram(program);
      return undefined;
    }

    context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      context.STATIC_DRAW,
    );
    context.useProgram(program);
    context.enableVertexAttribArray(positionLocation);
    context.vertexAttribPointer(
      positionLocation,
      2,
      context.FLOAT,
      false,
      0,
      0,
    );

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    const target = document.querySelector<HTMLElement>(TARGET_SELECTOR);
    let frameId = 0;
    let measurementFrameId = 0;
    let isIntersecting = true;
    let colorsNeedUpdate = true;
    let startTimestamp: number | null = null;
    let focus = { x: 0, y: 0 };
    let focusSize = { width: 1, height: 1 };
    let pointer = { x: 0, y: 0 };
    let targetPointer = { x: 0, y: 0 };
    let scrollProgress = 0;

    const rendersAtLowerFrameRate =
      window.matchMedia('(pointer: coarse)').matches;
    const minimumFrameInterval = rendersAtLowerFrameRate ? 1000 / 30 : 0;
    let lastDrawTimestamp = 0;

    const resize = () => {
      const ratio = Math.min(
        window.devicePixelRatio,
        rendersAtLowerFrameRate ? 1 : MAX_PIXEL_RATIO,
      );
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        context.viewport(0, 0, width, height);
      }

      const canvasRect = canvas.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      focus = targetRect
        ? {
            x:
              (targetRect.left + targetRect.width / 2 - canvasRect.left) *
              ratio,
            y:
              (canvasRect.bottom - (targetRect.top + targetRect.height / 2)) *
              ratio,
          }
        : { x: width / 2, y: height / 2 };
      focusSize = targetRect
        ? {
            width: targetRect.width * ratio,
            height: targetRect.height * ratio,
          }
        : { width: width * 0.4, height: height * 0.08 };
      scrollProgress = Math.min(
        1,
        Math.max(0, -canvasRect.top / Math.max(1, canvasRect.height)),
      );
    };

    const updateColors = () => {
      if (!colorContext) return false;

      const colors = COLOR_PROPERTIES.map((property) =>
        resolveThemeColor(colorContext, property),
      );
      if (colors.some((color) => color === null)) return false;

      colors.forEach((color, index) => {
        const location = colorLocations[index];
        if (color && location) context.uniform3fv(location, color);
      });
      colorsNeedUpdate = false;
      return true;
    };

    const draw = (timestamp: number) => {
      frameId = 0;
      if (!isIntersecting || document.hidden) return;
      if (timestamp - lastDrawTimestamp < minimumFrameInterval) {
        frameId = requestAnimationFrame(draw);
        return;
      }
      lastDrawTimestamp = timestamp;
      if (colorsNeedUpdate && !updateColors()) return;
      startTimestamp ??= timestamp;

      pointer = {
        x: pointer.x + (targetPointer.x - pointer.x) * 0.055,
        y: pointer.y + (targetPointer.y - pointer.y) * 0.055,
      };
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      context.uniform2f(focusLocation, focus.x, focus.y);
      context.uniform2f(focusSizeLocation, focusSize.width, focusSize.height);
      context.uniform2f(pointerLocation, pointer.x, pointer.y);
      context.uniform1f(timeLocation, (timestamp - startTimestamp) / 1000);
      context.uniform1f(scrollLocation, scrollProgress);
      context.drawArrays(context.TRIANGLES, 0, 3);
      frameId = requestAnimationFrame(draw);
    };

    const start = () => {
      if (!frameId && isIntersecting && !document.hidden) {
        frameId = requestAnimationFrame(draw);
      }
    };
    const scheduleMeasurement = () => {
      if (!isIntersecting || measurementFrameId) return;

      measurementFrameId = requestAnimationFrame(() => {
        measurementFrameId = 0;
        resize();
        start();
      });
    };
    const handlePointerMove = (event: PointerEvent) => {
      targetPointer = {
        x: (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2,
        y: (0.5 - event.clientY / Math.max(1, window.innerHeight)) * 2,
      };
    };
    const handleVisibilityChange = () => {
      if (document.hidden && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else {
        start();
      }
    };
    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    resizeObserver.observe(canvas);
    if (target) resizeObserver.observe(target);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry?.isIntersecting ?? false;
      if (!isIntersecting) {
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
        if (measurementFrameId) {
          cancelAnimationFrame(measurementFrameId);
          measurementFrameId = 0;
        }
      } else {
        scheduleMeasurement();
      }
    });
    intersectionObserver.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      colorsNeedUpdate = true;
      start();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    window.addEventListener('resize', scheduleMeasurement);
    window.addEventListener('scroll', scheduleMeasurement, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resize();
    start();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (measurementFrameId) cancelAnimationFrame(measurementFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', scheduleMeasurement);
      window.removeEventListener('scroll', scheduleMeasurement);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      context.deleteBuffer(positionBuffer);
      context.deleteProgram(program);
    };
  }, [motionEnabled]);

  if (!motionEnabled) return null;

  return (
    <canvas
      ref={canvasRef}
      data-hero-signal-field
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
