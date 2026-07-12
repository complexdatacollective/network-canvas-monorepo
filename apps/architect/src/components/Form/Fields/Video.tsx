import { Video } from '../../Assets';
import File, { type FileInputPropsWithoutHOC } from './File';

type VideoInputProps = Omit<FileInputPropsWithoutHOC, 'children' | 'type'>;

const VideoInput = (props: VideoInputProps) => (
  <File type="video" {...props}>
    {(id: string) => (
      <div className="bg-rich-black relative w-full overflow-hidden pb-[57%]">
        <Video className="absolute top-0 left-0 size-full" id={id} controls />
      </div>
    )}
  </File>
);

export default VideoInput;
