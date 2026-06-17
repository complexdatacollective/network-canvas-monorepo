'use client';

import { INTERVIEWER_LABELS } from '~/components/customComponents/appVariants';
import { useSelectedApp } from '~/components/customComponents/useSelectedApp';

type InterviewerScreenshotProps = {
  name: string;
  alt?: string;
};

export const InterviewerScreenshot = ({
  name,
  alt = '',
}: InterviewerScreenshotProps) => {
  const [selectedApp] = useSelectedApp('interviewer');

  const isV6 = selectedApp === INTERVIEWER_LABELS.v6;
  const src = isV6
    ? `/assets/img/sample-protocol/${name}.png`
    : `/assets/img/interviewer-v8-guide/${name}.png`;

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="my-10 w-full px-8"
    >
      <img src={src} alt={alt} className="w-full" />
    </a>
  );
};
