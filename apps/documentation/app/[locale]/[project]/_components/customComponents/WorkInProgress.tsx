import PopoutBox from '~/components/PopoutBox';
import { Paragraph } from '@codaco/ui';
import Image from 'next/image';

const WorkInProgress = () => {
  // TODO: translations for this
  return (
    <PopoutBox
      title="Work in Progress"
      iconClassName="bg-accent"
      icon={
        <Image
          src="/images/work-in-progress.svg"
          alt="Work in progress"
          width={22}
          height={22}
        />
      }
    >
      <Paragraph>
        This article is currently being written, and is not yet complete. If you
        require support or assistance with this topic, please contact the
        project team directly.
      </Paragraph>
    </PopoutBox>
  );
};

export default WorkInProgress;
