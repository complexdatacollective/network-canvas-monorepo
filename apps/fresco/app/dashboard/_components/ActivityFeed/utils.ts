import type { BadgeColor } from '@codaco/fresco-ui/Badge';

export const getBadgeColorForActivityType = (type: string): BadgeColor => {
  switch (type) {
    case 'Protocol Installed':
      return 'slate-blue';
    case 'Protocol Uninstalled':
      return 'neon-carrot';
    case 'Participant(s) Added':
      return 'sea-green';
    case 'Participant(s) Removed':
      return 'tomato';
    case 'Interview Started':
      return 'sea-serpent';
    case 'Interview Completed':
      return 'purple-pizazz';
    case 'Interview Opened':
      return 'cerulean-blue';
    case 'Interview(s) Deleted':
      return 'paradise-pink';
    case 'Data Exported':
      return 'kiwi';
    case 'API Token Created':
      return 'cerulean-blue';
    case 'API Token Updated':
      return 'kiwi';
    case 'API Token Deleted':
      return 'cyber-grape';
    case 'Password Changed':
      return 'mustard';
    case 'User Login':
      return 'neon-coral';
    case 'User Created':
      return 'sea-green';
    case 'User Deleted':
      return 'charcoal';
    case 'Two-Factor Enabled':
      return 'sea-green';
    case 'Two-Factor Disabled':
      return 'neon-carrot';
    case 'Two-Factor Reset':
      return 'mustard';
    case 'Recovery Code Used':
      return 'purple-pizazz';
    case 'Recovery Codes Regenerated':
      return 'cerulean-blue';
    case 'Passkey Registered':
      return 'sea-green';
    case 'Passkey Removed':
      return 'neon-carrot';
    case 'Password Removed':
      return 'mustard';
    case 'Password Set':
      return 'sea-green';
    case 'Auth Reset':
      return 'tomato';
    case 'Switched to Passkey Mode':
      return 'sea-green';
    case 'Switched to Password Mode':
      return 'mustard';
    case 'Setting Changed':
      return 'mustard';
    case 'Synthetic Data Generated':
      return 'sea-green';
    case 'Synthetic Data Deleted':
      return 'neon-carrot';
    // Legacy event types kept for backward compatibility with existing DB rows
    case 'Two-Factor Login':
      return 'neon-coral';
    case 'Passkey Login':
      return 'neon-coral';
    case 'Recovery Code Login':
      return 'purple-pizazz';
    default:
      return 'slate-blue';
  }
};
