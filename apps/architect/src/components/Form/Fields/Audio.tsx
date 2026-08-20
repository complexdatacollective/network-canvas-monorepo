import { Audio } from '../../Assets';
import type { FileInputProps } from './File';
import File from './File';

type AudioInputProps = Omit<FileInputProps, 'children' | 'type'>;

const AudioInput = (props: AudioInputProps) => (
  <File type="audio" {...props}>
    {(id: string) => (
      <div className="flex w-full items-end justify-center [&_audio]:w-full">
        <Audio id={id} controls />
      </div>
    )}
  </File>
);

export default AudioInput;
