import { expect, test } from '../fixtures/interview-test.js';
import { TARGETED_SKIP_CONSENT_PROTOCOL_PATH } from '../helpers/protocol-paths.js';

test.describe('Targeted consent skip', () => {
  test.describe.configure({ mode: 'serial' });

  let protocolId: string;

  test.beforeAll(async ({ protocol }) => {
    ({ protocolId } = await protocol.installJson(
      TARGETED_SKIP_CONSENT_PROTOCOL_PATH,
    ));
  });

  test('uses the answer saved by the consent form to continue at the end', async ({
    page,
    protocol,
    interview,
    stage,
  }) => {
    interview.interviewId = await protocol.createInterview(protocolId);
    await interview.goto(0);

    // Schema 8's consent panel text migrates to an Information stage before
    // the form, and its title to the form's heading.
    await expect(
      page.getByRole('heading', { name: 'Consent', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Please confirm whether you agree to take part.'),
    ).toBeVisible();
    await interview.next();
    await expect(
      page.getByRole('heading', { name: 'Consent', level: 1 }),
    ).toBeVisible();
    await stage.form.selectRadio('agrees', 'No');
    await interview.next();

    await expect(page).toHaveURL(/step=4/);
    await expect(
      page.getByRole('heading', { name: 'Finish Interview' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Full interview' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Follow-up' }),
    ).not.toBeVisible();
  });
});
