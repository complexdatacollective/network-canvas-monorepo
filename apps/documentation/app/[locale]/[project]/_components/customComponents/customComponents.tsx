import ButtonPrimary from './ButtonPrimary';
import ButtonSecondary from './ButtonSecondary';
import CustomAnchor from './CustomAnchor';
import { styledHeadings } from './CustomHeadings';
import ImageFloatLeft from './ImageFloatLeft';
import ImageFullWith from './ImageFullWith';
import KeyConcept from './KeyConcept';
import StandAloneImage from './StandAloneImage';
import TipBox from './TipBox';
import { CheckSquare, XOctagon } from 'lucide-react';

export const customComponents = {
  ...styledHeadings,
  ButtonPrimary,
  ButtonSecondary,
  ImageFloatLeft,
  ImageFullWith,
  KeyConcept,
  StandAloneImage,
  TipBox,
  GoodPractice: () => <CheckSquare className="inline text-green-500" />,
  BadPractice: () => <XOctagon className="inline text-red-500" />,
  a: CustomAnchor,
};
