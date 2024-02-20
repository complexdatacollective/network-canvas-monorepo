import TipBox from './TipBox';

const WorkInProgress = () => {
  return (
    <TipBox danger>
      <p className="font-bold">WORK IN PROGRESS</p>
      <p>
        This article is currently being written, and is not yet complete. If you
        require support or assistance with this topic, please contact the
        project team directly.
      </p>
    </TipBox>
  );
};

export default WorkInProgress;
