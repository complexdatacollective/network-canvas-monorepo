const VideoIFrame = ({ src, title }: { src: string; title: string }) => {
  return (
    <iframe
      title={title}
      src={src}
      // oxlint-disable-next-line react/iframe-missing-sandbox -- the YouTube player throws a SecurityError reading cookies without allow-same-origin and runs no script without allow-scripts, so the pair is required; the sandbox still blocks top navigation, forms and downloads
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      allowFullScreen
      className="aspect-video w-full"
    />
  );
};

export default VideoIFrame;
