interface TrackProps {
  source: {
    id: string;
    value: number;
    percent: number;
  };
  target: {
    id: string;
    value: number;
    percent: number;
  };
  getTrackProps: () => any;
}

const Track = ({ source, target, getTrackProps }: TrackProps) => (
	<div
		className="form-field-slider__track"
		style={{
			left: `${source.percent}%`,
			width: `${target.percent - source.percent}%`,
		}}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...getTrackProps()}
	>
		<div className="form-field-slider__track-line" />
	</div>
);

export default Track;