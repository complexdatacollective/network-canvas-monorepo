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

    await expect(
      page.getByRole('heading', { name: 'Consent', level: 1 }),
    ).toBeVisible();
    await interview.nextButton.click();
    await stage.form.selectRadio('agrees', 'No');
    await interview.next();

    await expect(page).toHaveURL(/step=3/);
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
