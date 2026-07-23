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

  uniform vec2 u_resolution;
  uniform vec2 u_focus;
  uniform vec2 u_focus_size;
  uniform vec2 u_pointer;
  uniform float u_time;
  uniform float u_scroll;
  uniform vec3 u_color_0;
  uniform vec3 u_color_1;
  uniform vec3 u_color_2;
  uniform vec3 u_color_3;

  float lineGlow(float distanceFromLine, float width) {
    float safeWidth = max(width, 0.0001);
    return exp(
      -(distanceFromLine * distanceFromLine) /
      (safeWidth * safeWidth)
    );
  }

  float signalNode(vec2 point, vec2 position, float radius) {
    vec2 offset = point - position;
    return exp(-dot(offset, offset) / max(radius * radius, 0.0001));
  }

  float signalTail(
    vec2 point,
    vec2 origin,
    vec2 target,
    float width
  ) {
    vec2 segment = target - origin;
    float segmentLength = max(dot(segment, segment), 0.0001);
    float progress = clamp(
      dot(point - origin, segment) / segmentLength,
      0.0,
      1.0
    );
    float distanceFromSegment = length(
      point - (origin + segment * progress)
    );
    return lineGlow(distanceFromSegment, width) * progress;
  }

  float angularLobe(float angle, float heading) {
    return 0.12 + 0.88 * pow(
      max(0.0, 0.5 + 0.5 * cos(angle - heading)),
      5.0
    );
  }

  void main() {
    float shortestSide = min(u_resolution.x, u_resolution.y);
    vec2 point = (gl_FragCoord.xy - u_focus) / shortestSide;
    point -= u_pointer * 0.014;

    vec2 targetHalfSize = max(
      u_focus_size / (shortestSide * 2.0),
      vec2(0.14, 0.035)
    );
    vec2 lensScale = vec2(
      targetHalfSize.x * 1.24,
      targetHalfSize.y * 2.85
    );
    float scrollSpread = mix(
      1.0,
      1.32,
      smoothstep(0.08, 0.72, u_scroll)
    );
    vec2 lensPoint = point / (lensScale * scrollSpread);
    float radius = length(lensPoint);
    float angle = atan(lensPoint.y, lensPoint.x);
    float pixelWidth = max(
      0.009,
      2.2 / max(shortestSide * min(lensScale.x, lensScale.y), 1.0)
    );
    float visibility = 1.0 - smoothstep(0.2, 0.92, u_scroll);
    float envelope = 1.0 - smoothstep(1.55, 2.05, radius);
    float breathe = 0.5 + 0.5 * sin(u_time * 0.72);

    float filament0 = lineGlow(
      radius - (0.87 + 0.055 * sin(angle * 3.0 - u_time * 0.48)),
      pixelWidth
    ) * angularLobe(angle, u_time * 0.24);
    float filament1 = lineGlow(
      radius - (1.02 + 0.05 * sin(angle * 4.0 + u_time * 0.4)),
      pixelWidth * 0.9
    ) * angularLobe(angle, 1.5708 - u_time * 0.2);
    float filament2 = lineGlow(
      radius - (1.17 + 0.045 * sin(angle * 5.0 - u_time * 0.34)),
      pixelWidth
    ) * angularLobe(angle, 3.1416 + u_time * 0.17);
    float filament3 = lineGlow(
      radius - (1.32 + 0.05 * sin(angle * 4.0 + u_time * 0.29)),
      pixelWidth * 0.92
    ) * angularLobe(angle, 4.7124 - u_time * 0.15);

    float wavePhase0 = fract(u_time * 0.045);
    float wavePhase1 = fract(u_time * 0.045 + 0.25);
    float wavePhase2 = fract(u_time * 0.045 + 0.5);
    float wavePhase3 = fract(u_time * 0.045 + 0.75);
    float wave0 = lineGlow(
      radius - (0.56 + wavePhase0 * 0.96),
      pixelWidth * 0.8
    ) * (1.0 - wavePhase0);
    float wave1 = lineGlow(
      radius - (0.56 + wavePhase1 * 0.96),
      pixelWidth * 0.8
    ) * (1.0 - wavePhase1);
    float wave2 = lineGlow(
      radius - (0.56 + wavePhase2 * 0.96),
      pixelWidth * 0.8
    ) * (1.0 - wavePhase2);
    float wave3 = lineGlow(
      radius - (0.56 + wavePhase3 * 0.96),
      pixelWidth * 0.8
    ) * (1.0 - wavePhase3);

    float orbitAngle0 = u_time * 0.36;
    float orbitAngle1 = u_time * 0.29 + 1.5708;
    float orbitAngle2 = -u_time * 0.32 + 3.1416;
    float orbitAngle3 = -u_time * 0.26 + 4.7124;
    vec2 orbit0 = vec2(cos(orbitAngle0), sin(orbitAngle0)) * 0.94;
    vec2 orbit1 = vec2(cos(orbitAngle1), sin(orbitAngle1)) * 1.08;
    vec2 orbit2 = vec2(cos(orbitAngle2), sin(orbitAngle2)) * 1.22;
    vec2 orbit3 = vec2(cos(orbitAngle3), sin(orbitAngle3)) * 1.36;
    vec2 tail0 = vec2(cos(orbitAngle0 - 0.2), sin(orbitAngle0 - 0.2)) * 0.94;
    vec2 tail1 = vec2(cos(orbitAngle1 - 0.18), sin(orbitAngle1 - 0.18)) * 1.08;
    vec2 tail2 = vec2(cos(orbitAngle2 + 0.19), sin(orbitAngle2 + 0.19)) * 1.22;
    vec2 tail3 = vec2(cos(orbitAngle3 + 0.17), sin(orbitAngle3 + 0.17)) * 1.36;

    float bead0 =
      signalNode(lensPoint, orbit0, 0.055) +
      signalTail(lensPoint, tail0, orbit0, 0.018) * 0.55;
    float bead1 =
      signalNode(lensPoint, orbit1, 0.05) +
      signalTail(lensPoint, tail1, orbit1, 0.017) * 0.55;
    float bead2 =
      signalNode(lensPoint, orbit2, 0.052) +
      signalTail(lensPoint, tail2, orbit2, 0.017) * 0.55;
    float bead3 =
      signalNode(lensPoint, orbit3, 0.048) +
      signalTail(lensPoint, tail3, orbit3, 0.016) * 0.55;

    float aura = exp(
      -pow(max(radius - 0.54, 0.0), 2.0) / 0.34
    ) * smoothstep(0.34, 0.72, radius) * (0.055 + breathe * 0.018);

    float weight0 =
      filament0 * 0.9 + wave0 * 0.58 + bead0 * 1.18 +
      aura * angularLobe(angle, 0.0);
    float weight1 =
      filament1 * 0.9 + wave1 * 0.58 + bead1 * 1.18 +
      aura * angularLobe(angle, 1.5708);
    float weight2 =
      filament2 * 0.9 + wave2 * 0.58 + bead2 * 1.18 +
      aura * angularLobe(angle, 3.1416);
    float weight3 =
      filament3 * 0.9 + wave3 * 0.58 + bead3 * 1.18 +
      aura * angularLobe(angle, 4.7124);
    float totalWeight = weight0 + weight1 + weight2 + weight3;
    vec3 color = (
      u_color_0 * weight0 +
      u_color_1 * weight1 +
      u_color_2 * weight2 +
      u_color_3 * weight3
    ) / max(totalWeight, 0.0001);

    vec2 quietBox = abs(point) - targetHalfSize * vec2(1.02, 0.86);
    float quietDistance =
      length(max(quietBox, 0.0)) +
      min(max(quietBox.x, quietBox.y), 0.0);
    float quietZone = mix(
      0.12,
      1.0,
      smoothstep(-0.012, 0.045, quietDistance)
    );
    float alpha = clamp(totalWeight * 0.72, 0.0, 0.94);
    alpha *= envelope * visibility * quietZone;

    gl_FragColor = vec4(color, alpha);
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
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!context) return undefined;

    const program = createProgram(context);
    if (!program) return undefined;

    const positionLocation = context.getAttribLocation(program, 'a_position');
    const resolutionLocation = context.getUniformLocation(
      program,
      'u_resolution',
    );
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
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA);

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

      pointer = {
        x: pointer.x + (targetPointer.x - pointer.x) * 0.055,
        y: pointer.y + (targetPointer.y - pointer.y) * 0.055,
      };
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      context.uniform2f(resolutionLocation, canvas.width, canvas.height);
      context.uniform2f(focusLocation, focus.x, focus.y);
      context.uniform2f(focusSizeLocation, focusSize.width, focusSize.height);
      context.uniform2f(pointerLocation, pointer.x, pointer.y);
      context.uniform1f(timeLocation, timestamp / 1000);
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
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
