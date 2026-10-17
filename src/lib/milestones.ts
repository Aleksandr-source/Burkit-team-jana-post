import { Milestone } from '../types';

export const getMilestones = (t: (key: string, options?: Record<string, unknown>) => string): Milestone[] => [
  {
    id: 'ms1',
    title: t('journey.milestones.ms1.title', { defaultValue: 'Research & Planning' }),
    description: t('journey.milestones.ms1.desc', { defaultValue: 'Define project scope, requirements, and target audience.' }),
    order: 1,
  },
  {
    id: 'ms2',
    title: t('journey.milestones.ms2.title', { defaultValue: 'Design & Prototyping' }),
    description: t('journey.milestones.ms2.desc', { defaultValue: 'Create initial wireframes and UX/UI designs.' }),
    order: 2,
  },
  {
    id: 'ms3',
    title: t('journey.milestones.ms3.title', { defaultValue: 'Core Development' }),
    description: t('journey.milestones.ms3.desc', { defaultValue: 'Implement key logic and features.' }),
    order: 3,
  },
  {
    id: 'ms4',
    title: t('journey.milestones.ms4.title', { defaultValue: 'Testing & QA' }),
    description: t('journey.milestones.ms4.desc', { defaultValue: 'Identify and resolve bugs, ensure stability.' }),
    order: 4,
  },
  {
    id: 'ms5',
    title: t('journey.milestones.ms5.title', { defaultValue: 'Launch Preparation' }),
    description: t('journey.milestones.ms5.desc', { defaultValue: 'Deploy to staging, marketing materials, and final checks.' }),
    order: 5,
  },
  {
    id: 'ms6',
    title: t('journey.milestones.ms6.title', { defaultValue: 'Release & Monitoring' }),
    description: t('journey.milestones.ms6.desc', { defaultValue: 'Live deployment and post-launch analytics.' }),
    order: 6,
  }
];
