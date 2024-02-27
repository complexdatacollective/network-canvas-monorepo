import Link from 'next/link';
import { CheckSquare, XOctagon } from 'lucide-react';

import { Button, Paragraph } from '@acme/ui';

import { styledHeadings } from './CustomHeadings';
import ImageFloatLeft from './ImageFloatLeft';
import ImageFullWith from './ImageFullWith';
import KeyConcept from './KeyConcept';
import StandAloneImage from './StandAloneImage';
import TipBox from './TipBox';

export const customComponents = {
  ...styledHeadings,
  ImageFloatLeft,
  ImageFullWith,
  KeyConcept,
  StandAloneImage,
  TipBox,
  Button,
  GoodPractice: () => <CheckSquare className="inline text-success" />,
  BadPractice: () => <XOctagon className="inline text-destructive" />,
  a: Link,
  p: Paragraph,
  button: Button,
};
