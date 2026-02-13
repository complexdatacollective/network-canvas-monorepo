/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect, useRef, useState } from "react";
import MiniTable from "./MiniTable";
import useAssetData from "./useAssetData";

type AssetProps = {
	id: string;
	size?: string | null;
};

const Asset = ({ id, size = null }: AssetProps) => {
	const { url, type, name, variables } = useAssetData(id);

	const videoRef = useRef<HTMLVideoElement>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const [state, setState] = useState({ duration: "0s" });
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
		const element = type === "video" ? videoElement : type === "audio" ? audioElement : null;

		if (element) {
			element.addEventListener("loadedmetadata", metaDataListener.current);
		}

		return () => {
			if (element) {
				element.removeEventListener("loadedmetadata", metaDataListener.current);
			}
		};
	}, [type]);

	return (
		<div className="protocol-summary-asset-manifest__asset" id={`asset-${id}`}>
			{type === "image" && (
				<MiniTable
					rotated
					rows={[
						["Name", name],
						...(size ? [["Block Size", size]] : []),
						["Type", "Image"],
						// eslint-disable-next-line jsx-a11y/media-has-caption
						[
							"Preview",
							<div key="image-preview" className="protocol-summary-asset-manifest__asset-media">
								<img src={url} alt={name} />
							</div>,
						],
					]}
				/>
			)}

			{type === "video" && (
				<MiniTable
					rotated
					rows={[
						["Name", name],
						...(size ? [["Block Size", size]] : []),
						["Type", "Video"],
						["Duration", state.duration],
						[
							"Preview",
							<div key="video-preview" className="protocol-summary-asset-manifest__asset-media">
								<video src={url} ref={videoRef} preload="auto">
									<source src={`${url}#t=1`} type="video/mp4" />
									<track kind="captions" srcLang="en" label="English" />
								</video>
							</div>,
						],
					]}
				/>
			)}

			{type === "audio" && (
				<MiniTable
					rotated
					rows={[
						["Name", name],
						...(size ? [["Block Size", size]] : []),
						["Type", "Audio"],
						["Duration", state.duration],
						[
							"Preview",
							<audio key="audio-preview" src={url} ref={audioRef}>
								<track kind="captions" srcLang="en" label="English" />
							</audio>,
						],
					]}
				/>
			)}

			{type === "network" && variables && (
				<MiniTable
					rotated
					rows={[
						["Name", name],
						["Type", "Network"],
						["Variables", variables],
					]}
				/>
			)}

			{type === "geojson" && (
				<MiniTable
					rotated
					rows={[
						["Name", name],
						["Type", "GeoJSON"],
					]}
				/>
			)}

			{type === "apikey" && (
				<MiniTable
					rotated
					rows={[
						["Name", name],
						["Type", "API Key"],
					]}
				/>
			)}
		</div>
	);
};

export default Asset;
