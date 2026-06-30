import { Microscope } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { Badge } from './Badge';
import { Tooltip } from './Tooltip';

export type TestingProps = {
  className?: string;
  tooltipContent?: React.ReactNode;
};

export const Testing = ({ className, tooltipContent }: TestingProps) => {
  const { t } = useTranslation('common');

  return (
    <Tooltip
      content={
        <p className="max-w-64 text-sm leading-relaxed">
          {tooltipContent ??
            t(
              'Testing.Description',
              'This alpha feature has not been tested by a wider group of users yet. Feedback is appreciated.'
            )}
        </p>
      }
      side="top"
      align="center"
      sideOffset={8}
    >
      <span className="inline-flex" tabIndex={0}>
        <Badge
          variant="outline"
          className={cn(
            'cursor-help border-sky-400/60 bg-sky-50 text-sky-900 shadow-none hover:bg-sky-100 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/15',
            className
          )}
          icon={<Microscope className="h-3 w-3" />}
        >
          {t('Testing.Label', 'Testing')}
        </Badge>
      </span>
    </Tooltip>
  );
};

export default Testing;
