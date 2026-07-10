// TODO: add filter
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import AssetBadge from '../AssetBadge';
import MiniTable from '../MiniTable';
import SectionFrame from './SectionFrame';
type PanelsProps = {
  panels?: Array<{
    id: string;
    title: string;
    dataSource: string;
  }> | null;
};
const Panels = ({ panels = null }: PanelsProps) => {
  if (!panels || panels.length === 0) {
    return null;
  }
  return (
    <SectionFrame title="Panels">
      <ol className="m-0 ps-10">
        {panels.map((panel) => (
          <li className="my-5 pl-5" key={panel.id}>
            <MiniTable
              rotated
              rows={[
                ['Title', panel.title],
                [
                  'Data Source',
                  panel.dataSource === 'existing' ? (
                    <Paragraph key="existing">
                      <em>Existing network</em>
                    </Paragraph>
                  ) : (
                    <AssetBadge key="asset" id={panel.dataSource} link />
                  ),
                ],
              ]}
            />
          </li>
        ))}
      </ol>
    </SectionFrame>
  );
};
export default Panels;
