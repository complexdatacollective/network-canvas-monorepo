import { createLucideIcon } from 'lucide-react';

/**
 * The automated protocol review's icon: a clipboard with a sparkle. Built like
 * any Lucide icon, so it takes the same props (`size`, `className`, ...).
 */
const ReviewSparklesIcon = createLucideIcon('ReviewSparkles', [
  [
    'rect',
    { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1', key: 'clip' },
  ],
  ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v2', key: 'top-right' }],
  ['path', { d: 'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4', key: 'left' }],
  [
    'path',
    { d: 'M16 10q.7 4.3 5 5q-4.3.7-5 5q-.7-4.3-5-5q4.3-.7 5-5z', key: 'star' },
  ],
  ['path', { d: 'M20.5 19v3', key: 'plus-v' }],
  ['path', { d: 'M19 20.5h3', key: 'plus-h' }],
]);

export default ReviewSparklesIcon;
