import type { ComponentType } from 'react';

import type { SceneId } from '../types';
import { AccountScene } from './AccountScene';
import { BucketScene } from './BucketScene';
import { DatabaseScene } from './DatabaseScene';
import { DeadlineScene } from './DeadlineScene';
import { DeployScene } from './DeployScene';
import { EnvCheckScene, EnvCopyScene, EnvEditScene } from './EnvFileScene';
import { ForkedScene } from './ForkedScene';
import { ForkScene } from './ForkScene';
import { HourScene } from './HourScene';
import { LiveScene } from './LiveScene';
import { PickRepoScene } from './PickRepoScene';
import { SafeScene } from './SafeScene';
import { ServicesScene } from './ServicesScene';
import {
  GitHubSignInScene,
  NeonSignInScene,
  NetlifySignInScene,
} from './SignInScene';
import { SignUpScene } from './SignUpScene';
import { StorageScene } from './StorageScene';

export const scenes: Record<SceneId, ComponentType> = {
  'services': ServicesScene,
  'hour': HourScene,
  'account': AccountScene,
  'sign-up': SignUpScene,
  'github-sign-in': GitHubSignInScene,
  'fork': ForkScene,
  'forked': ForkedScene,
  'database': DatabaseScene,
  'neon-sign-in': NeonSignInScene,
  'env-edit': EnvEditScene,
  'env-check': EnvCheckScene,
  'deploy': DeployScene,
  'netlify-sign-in': NetlifySignInScene,
  'pick-repo': PickRepoScene,
  'env-copy': EnvCopyScene,
  'deadline': DeadlineScene,
  'safe': SafeScene,
  'storage': StorageScene,
  'bucket': BucketScene,
  'live': LiveScene,
};
