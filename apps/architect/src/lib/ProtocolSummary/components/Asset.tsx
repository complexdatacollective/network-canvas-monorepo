/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from './MiniTable';
import useAssetData from './useAssetData';
const messages = defineMessages({
  english: {
    id: 'architect.protocolSummary.asset.english',
    defaultMessage: 'English',
    description:
      'The label text in lib / ProtocolSummary / components / Asset.',
  },
});

type AssetProps = {
  id: string;
  size?: string | null;
};

const mediaClass =
  'inline-block w-1/2 bg-[#808080] text-[0] [&_img]:w-full [&_video]:w-full';
const imagePreviewClass =
  'inline-block aspect-video w-1/2 overflow-hidden bg-[#808080] text-[0] [&_img]:block [&_img]:size-full [&_img]:object-contain [&_img]:object-center';
const responsiveSvgPreviewClass =
  'inline-block h-[180px] w-[320px] overflow-hidden bg-[#808080] text-[0] [&_img]:block [&_img]:h-[720px] [&_img]:w-[1280px] [&_img]:max-w-none [&_img]:origin-top-left [&_img]:scale-[0.25] [&_img]:object-contain [&_img]:object-center';

const Asset = ({ id, size = null }: AssetProps) => {
  const intl = useAppIntl();
  const { url, type, name, variables } = useAssetData(id);
  const isSvg = name?.toLowerCase().endsWith('.svg') ?? false;

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const durationLabel = intl.formatNumber(duration, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'narrow',
    maximumFractionDigits: 2,
  });
  const metaDataListener = useRef((event: Event) => {
    const target = event.target as HTMLVideoElement | HTMLAudioElement;
    if (target && Number.isFinite(target.duration)) {
      setDuration(target.duration);
    }
  });

  useEffect(() => {
    const videoElement = videoRef.current;
    const audioElement = audioRef.current;
    const element =
      type === 'video' ? videoElement : type === 'audio' ? audioElement : null;

    if (element) {
      element.addEventListener('loadedmetadata', metaDataListener.current);
    }

    return () => {
      if (element) {
        element.removeEventListener('loadedmetadata', metaDataListener.current);
      }
    };
  }, [type]);

  return (
    <div id={`asset-${id}`}>
      {type === 'image' && (
        <MiniTable
          rotated
          rows={[
            [intl.formatMessage(summaryMessages.name), name],
            ...(size
              ? [[intl.formatMessage(summaryMessages.blockSize), size]]
              : []),
            [
              intl.formatMessage(summaryMessages.type),
              intl.formatMessage(summaryMessages.image),
            ],
            // eslint-disable-next-line jsx-a11y/media-has-caption
            [
              intl.formatMessage(summaryMessages.preview),
              <div
                key="image-preview"
                className={
                  isSvg ? responsiveSvgPreviewClass : imagePreviewClass
                }
              >
                <img src={url} alt={name} />
              </div>,
            ],
          ]}
        />
      )}

      {type === 'video' && (
        <MiniTable
          rotated
          rows={[
            [intl.formatMessage(summaryMessages.name), name],
            ...(size
              ? [[intl.formatMessage(summaryMessages.blockSize), size]]
              : []),
            [
              intl.formatMessage(summaryMessages.type),
              intl.formatMessage(summaryMessages.video),
            ],
            [intl.formatMessage(summaryMessages.duration), durationLabel],
            [
              intl.formatMessage(summaryMessages.preview),
              <div key="video-preview" className={mediaClass}>
                <video
                  src={url}
                  ref={videoRef}
                  preload="auto"
                  aria-label={name}
                >
                  <source src={`${url}#t=1`} type="video/mp4" />
                  <track
                    kind="captions"
                    srcLang="en"
                    label={intl.formatMessage(messages.english)}
                  />
                </video>
              </div>,
            ],
          ]}
        />
      )}

      {type === 'audio' && (
        <MiniTable
          rotated
          rows={[
            [intl.formatMessage(summaryMessages.name), name],
            ...(size
              ? [[intl.formatMessage(summaryMessages.blockSize), size]]
              : []),
            [
              intl.formatMessage(summaryMessages.type),
              intl.formatMessage(summaryMessages.audio),
            ],
            [intl.formatMessage(summaryMessages.duration), durationLabel],
            [
              intl.formatMessage(summaryMessages.preview),
              <audio
                key="audio-preview"
                src={url}
                ref={audioRef}
                aria-label={name}
              >
                <track
                  kind="captions"
                  srcLang="en"
                  label={intl.formatMessage(messages.english)}
                />
              </audio>,
            ],
          ]}
        />
      )}

      {type === 'network' && variables && (
        <MiniTable
          rotated
          rows={[
            [intl.formatMessage(summaryMessages.name), name],
            [
              intl.formatMessage(summaryMessages.type),
              intl.formatMessage(summaryMessages.network),
            ],
            [
              intl.formatMessage(summaryMessages.attributes),
              intl.formatList(variables),
            ],
          ]}
        />
      )}

      {type === 'geojson' && (
        <MiniTable
          rotated
          rows={[
            [intl.formatMessage(summaryMessages.name), name],
            [
              intl.formatMessage(summaryMessages.type),
              intl.formatMessage(summaryMessages.geoJSON),
            ],
          ]}
        />
      )}

      {type === 'apikey' && (
        <MiniTable
          rotated
          rows={[
            [intl.formatMessage(summaryMessages.name), name],
            [
              intl.formatMessage(summaryMessages.type),
              intl.formatMessage(summaryMessages.aPIKey),
            ],
          ]}
        />
      )}
    </div>
  );
};

export default Asset;
