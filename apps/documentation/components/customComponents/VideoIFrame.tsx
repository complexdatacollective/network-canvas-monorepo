const VideoIFrame = ({ src, title }: { src: string; title: string }) => {
	return <iframe title={title} src={src} allowFullScreen className="aspect-video w-full" />;
};

export default VideoIFrame;
