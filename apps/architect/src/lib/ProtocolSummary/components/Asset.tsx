/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect, useRef, useState } from 'react';

import MiniTable from './MiniTable';
import useAssetData from './useAssetData';

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
  const { url, type, name, variables } = useAssetData(id);
  const isSvg = name?.toLowerCase().endsWith('.svg') ?? false;

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState({ duration: '0s' });
  const metaDataListener = useRef((event: Event) => {
    const target = event.target as HTMLVideoElement | HTMLAudioElement;
    if (target?.duration) {
      const duration = target.duration.toFixed(2);
      setState({ duration: `${duration}s` });
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
            ['Name', name],
            ...(size ? [['Block Size', size]] : []),
            ['Type', 'Image'],
            // eslint-disable-next-line jsx-a11y/media-has-caption
            [
              'Preview',
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
            ['Name', name],
            ...(size ? [['Block Size', size]] : []),
            ['Type', 'Video'],
            ['Duration', state.duration],
            [
              'Preview',
              <div key="video-preview" className={mediaClass}>
                <video
                  src={url}
                  ref={videoRef}
                  preload="auto"
                  aria-label={name}
                >
                  <source src={`${url}#t=1`} type="video/mp4" />
                  <track kind="captions" srcLang="en" label="English" />
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
            ['Name', name],
            ...(size ? [['Block Size', size]] : []),
            ['Type', 'Audio'],
            ['Duration', state.duration],
            [
              'Preview',
              <audio
                key="audio-preview"
                src={url}
                ref={audioRef}
                aria-label={name}
              >
                <track kind="captions" srcLang="en" label="English" />
              </audio>,
            ],
          ]}
        />
      )}

      {type === 'network' && variables && (
        <MiniTable
          rotated
          rows={[
            ['Name', name],
            ['Type', 'Network'],
            ['Attributes', variables],
          ]}
        />
      )}

      {type === 'geojson' && (
        <MiniTable
          rotated
          rows={[
            ['Name', name],
            ['Type', 'GeoJSON'],
          ]}
        />
      )}

      {type === 'apikey' && (
        <MiniTable
          rotated
          rows={[
            ['Name', name],
            ['Type', 'API Key'],
          ]}
        />
      )}
    </div>
  );
};

export default Asset;
