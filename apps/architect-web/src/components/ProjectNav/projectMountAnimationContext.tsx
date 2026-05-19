import { createContext, useContext } from 'react';

export type ProjectMountAnimationContextValue = {
  isInitialLoad: boolean;
  markAnimated: () => void;
};

export const ProjectMountAnimationContext =
  createContext<ProjectMountAnimationContextValue>({
    isInitialLoad: false,
    markAnimated: () => {},
  });

export const useProjectMountAnimation = () =>
  useContext(ProjectMountAnimationContext);
