import type { ComponentType } from 'react';

import type { SceneId } from '../types';
import { AccountScene } from './AccountScene';
import { ArchitectVersionsScene } from './ArchitectVersionsScene';
import { BucketScene } from './BucketScene';
import { ClassicTabScene } from './ClassicTabScene';
import { ClassroomScene } from './ClassroomScene';
import { DatabaseScene } from './DatabaseScene';
import { DeadlineScene } from './DeadlineScene';
import { DeployScene } from './DeployScene';
import { EgoFilterScene } from './EgoFilterScene';
import { EnvCheckScene, EnvCopyScene, EnvEditScene } from './EnvFileScene';
import { ForkedScene } from './ForkedScene';
import { ForkScene } from './ForkScene';
import { HourScene } from './HourScene';
import { LiveScene } from './LiveScene';
import { PickRepoScene } from './PickRepoScene';
import { AddedOnceScene, TwoQuestionsScene } from './QuestionsScene';
import { CardDetailScene, RosterDragScene } from './RosterCardScene';
import { RosterDownloadScene, RosterFilesScene } from './RosterFileScene';
import { SafeScene } from './SafeScene';
import { ServicesScene } from './ServicesScene';
import { SidePanelsScene } from './SidePanelsScene';
import {
  GitHubSignInScene,
  NeonSignInScene,
  NetlifySignInScene,
} from './SignInScene';
import { SignUpScene } from './SignUpScene';
import {
  SheetCheckScene,
  SheetCsvScene,
  SheetLayoutScene,
  SheetNameScene,
  SheetUniqueScene,
} from './SpreadsheetScene';
import { StorageScene } from './StorageScene';
import { EgoFirstScene, RosterReadyScene } from './TimelineScene';

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
  'roster-drag': RosterDragScene,
  'architect-versions': ArchitectVersionsScene,
  'classic-tab': ClassicTabScene,
  'roster-files': RosterFilesScene,
  'roster-download': RosterDownloadScene,
  'sheet-layout': SheetLayoutScene,
  'sheet-name': SheetNameScene,
  'sheet-unique': SheetUniqueScene,
  'sheet-csv': SheetCsvScene,
  'sheet-check': SheetCheckScene,
  'card-detail': CardDetailScene,
  'two-questions': TwoQuestionsScene,
  'added-once': AddedOnceScene,
  'side-panels': SidePanelsScene,
  'roster-ready': RosterReadyScene,
  'classroom': ClassroomScene,
  'ego-filter': EgoFilterScene,
  'ego-first': EgoFirstScene,
};
