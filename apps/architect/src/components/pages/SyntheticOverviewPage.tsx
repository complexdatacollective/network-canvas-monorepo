import { Layout } from '~/components/EditorLayout';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { SyntheticOverview } from '~/components/SyntheticOverview/SyntheticOverview';

const TITLE = 'Synthetic data';
const DESCRIPTION =
  'Everything that shapes the sample interviews this protocol can generate: what each stage produces, what each attribute is filled with, and whether the protocol can be generated at all. Nothing is edited here — each row opens the editor that owns it.';

const SyntheticOverviewPage = () => (
  <Layout className="phone-landscape:px-7 tablet-landscape:px-29 px-5">
    <PageHeading title={TITLE} description={DESCRIPTION} />
    <SyntheticOverview />
  </Layout>
);

export default SyntheticOverviewPage;
