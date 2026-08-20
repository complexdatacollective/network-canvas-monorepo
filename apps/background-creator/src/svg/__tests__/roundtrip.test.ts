import { describe, expect, it } from 'vitest';

import {
  createBlankDocument,
  createConcentricCirclesTemplate,
  createPoliticalCompassDocument,
  createQuadrantsTemplate,
} from '~/model/templates';
import type { BackgroundDocument } from '~/model/types';
import { parseDocument } from '~/svg/parse';
import { serializeDocument } from '~/svg/serialize';

// A document that exercises every element kind and every optional branch:
// stroked + unstroked rect/ellipse/polygon (some marked as zones, some not,
// including theme-sentinel fills and strokes); a line with both arrows, a line
// with one arrow reusing that colour's marker, a line with no arrows, a line
// whose arrow uses a second distinct colour, and a sentinel-stroked line with
// an arrow; single-, two-, and three-line text with varied opacity, size
// token, and weight (one with a sentinel fill); and XML-hostile characters in
// the title, description, and a zone label.
const kitchenSink: BackgroundDocument = {
  version: 1,
  title: 'Round & trip <test>',
  description: 'Exercises "every" branch & <edge> case',
  elements: [
    {
      id: 'rect-stroked',
      kind: 'rect',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      fill: '#123456',
      fillOpacity: 0.5,
      stroke: '#abcdef',
      strokeWidth: 2.5,
      zoneLabel: 'A & B <"quotes">',
    },
    {
      id: 'rect-plain',
      kind: 'rect',
      x: 0,
      y: 0,
      width: 1,
      height: 0.235,
      fill: '#000000',
      fillOpacity: 1,
      stroke: null,
      strokeWidth: 1,
      zoneLabel: null,
    },
    {
      id: 'ellipse-stroked',
      kind: 'ellipse',
      cx: 0.5,
      cy: 0.5,
      rx: 0.25,
      ry: 0.1,
      fill: 'background',
      fillOpacity: 0,
      stroke: 'text',
      strokeWidth: 3,
      zoneLabel: null,
    },
    {
      id: 'ellipse-plain',
      kind: 'ellipse',
      cx: 0.2,
      cy: 0.8,
      rx: 0.1,
      ry: 0.1,
      fill: '#00ff00',
      fillOpacity: 0.75,
      stroke: null,
      strokeWidth: 0.25,
      zoneLabel: 'ring',
    },
    {
      id: 'line-both-arrows',
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      stroke: '#ffffff',
      strokeWidth: 3,
      startArrow: true,
      endArrow: true,
    },
    {
      id: 'line-one-arrow-same-colour',
      kind: 'line',
      x1: 0,
      y1: 1,
      x2: 1,
      y2: 0,
      stroke: '#ffffff',
      strokeWidth: 2,
      startArrow: false,
      endArrow: true,
    },
    {
      id: 'line-no-arrows',
      kind: 'line',
      x1: 0.5,
      y1: 0,
      x2: 0.5,
      y2: 1,
      stroke: '#888888',
      strokeWidth: 1,
      startArrow: false,
      endArrow: false,
    },
    {
      id: 'line-second-colour',
      kind: 'line',
      x1: 0,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      stroke: '#ff8800',
      strokeWidth: 2,
      startArrow: true,
      endArrow: false,
    },
    {
      id: 'line-sentinel-stroke',
      kind: 'line',
      x1: 0.1,
      y1: 0.9,
      x2: 0.9,
      y2: 0.9,
      stroke: 'text',
      strokeWidth: 2,
      startArrow: true,
      endArrow: true,
    },
    {
      id: 'polygon-stroked',
      kind: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.5, y: 0.9 },
      ],
      fill: '#334455',
      fillOpacity: 0.4,
      stroke: '#ffffff',
      strokeWidth: 1.5,
      zoneLabel: null,
    },
    {
      id: 'polygon-plain',
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 0.25, y: 0.5 },
        { x: 0, y: 0.5 },
      ],
      fill: '#654321',
      fillOpacity: 1,
      stroke: null,
      strokeWidth: 1,
      zoneLabel: 'triangle',
    },
    {
      id: 'text-two-lines',
      kind: 'text',
      x: 0.3,
      y: 0.3,
      lines: ['Line & one', 'Line <two>'],
      fill: 'text',
      fontSize: 'large',
      fontWeight: 700,
      opacity: 0.5,
    },
    {
      id: 'text-single-line',
      kind: 'text',
      x: 0.7,
      y: 0.7,
      lines: ['Solo "line"'],
      fill: '#eeeeee',
      fontSize: 'small',
      fontWeight: 400,
      opacity: 1,
    },
    {
      id: 'text-three-lines',
      kind: 'text',
      x: 0.9,
      y: 0.2,
      lines: ['A', 'B', 'C'],
      fill: '#cccccc',
      fontSize: 'extra-large',
      fontWeight: 500,
      opacity: 0.9,
    },
  ],
};

// Exercises the base64-of-UTF-8 metadata encoding with multi-byte characters
// (emoji are surrogate pairs in UTF-16, 4-byte sequences in UTF-8; CJK
// characters are 3-byte UTF-8 sequences) in title, description, a zone label,
// and painted text lines, to prove the round trip is byte-exact, not just
// ASCII-safe.
const unicodeDocument: BackgroundDocument = {
  version: 1,
  title: 'ネットワーク 🕸️ Canvas',
  description: '多字节字符 emoji 🎉 round-trip',
  elements: [
    {
      id: 'zone-unicode',
      kind: 'rect',
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      fill: '#123456',
      fillOpacity: 1,
      stroke: null,
      strokeWidth: 1,
      zoneLabel: '区域 🏷️',
    },
    {
      id: 'text-unicode',
      kind: 'text',
      x: 0.5,
      y: 0.5,
      lines: ['こんにちは', '🎉🎊', '中文标签'],
      fill: '#ffffff',
      fontSize: 'medium',
      fontWeight: 600,
      opacity: 1,
    },
  ],
};

describe('serialize/parse round trip', () => {
  const cases: Array<[string, BackgroundDocument]> = [
    ['blank template', createBlankDocument()],
    ['quadrants template', createQuadrantsTemplate()],
    ['concentric circles template', createConcentricCirclesTemplate()],
    ['political compass document', createPoliticalCompassDocument()],
    ['kitchen-sink document', kitchenSink],
    ['unicode document (emoji + CJK)', unicodeDocument],
  ];

  for (const [name, doc] of cases) {
    it(`preserves the ${name}`, () => {
      const restored = parseDocument(serializeDocument(doc));
      expect(restored).toEqual(doc);
    });
  }
});
