'use server';

import { cookies } from 'next/headers';

import { isFrescoLocale, localeMirrorCookie } from '~/i18n/locales';
import { getServerSession } from '~/lib/auth/guards';
import { prisma } from '~/lib/db';

export async function updateLocale(
  locale: string | null,
  expectedUserId: string | null,
) {
  if (locale !== null && !isFrescoLocale(locale)) return { success: false };
  const session = await getServerSession();
  // A queued write must never apply to a user who signs in after its author.
  if ((session?.user.userId ?? null) !== expectedUserId)
    return { success: false };
  if (session) {
    await prisma.user.update({
      where: { id: session.user.userId },
      data: { locale },
    });
  }
  const cookieStore = await cookies();
  if (locale === null) cookieStore.delete(localeMirrorCookie);
  else
    cookieStore.set(localeMirrorCookie, locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: 31536000,
    });
  return { success: true };
}
