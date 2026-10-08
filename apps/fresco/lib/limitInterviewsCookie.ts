import 'server-only';
import { cookies } from 'next/headers';

import { prisma } from '~/lib/db';

/**
 * The "limit interviews" setting allows one interview per protocol per
 * browser. Finishing an interview records it in a cookie named after the
 * protocol, holding the finished interview's id, so this browser can be sent
 * back to that interview's completed state rather than starting another.
 *
 * The value is the interview's access capability, so the cookie is never
 * readable by script. It lasts as long as the browser session, as it always
 * has.
 */
export async function setLimitInterviewsCookie(
  protocolId: string,
  interviewId: string,
) {
  (await cookies()).set(protocolId, interviewId, {
    httpOnly: true,
    sameSite: 'lax',
  });
}

/**
 * The finished interview of this protocol that this browser's cookie names,
 * or null when it names none. A value that is not a finished interview of the
 * protocol — including `completed`, which earlier versions wrote before the
 * cookie held an id — is ignored rather than trusted.
 */
export async function getLimitedInterviewId(
  protocolId: string,
): Promise<string | null> {
  const value = (await cookies()).get(protocolId)?.value;

  if (!value) return null;

  const interview = await prisma.interview.findFirst({
    where: { id: value, protocolId, finishTime: { not: null } },
    select: { id: true },
  });

  return interview?.id ?? null;
}
