import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { Badge } from './Badge';
import { Tooltip } from './Tooltip';

export type ExperimentalProps = {
  className?: string;
  tooltipContent?: React.ReactNode;
};

export const Experimental = ({
  className,
  tooltipContent,
}: ExperimentalProps) => {
  const { t } = useTranslation('common');

  return (
    <Tooltip
      content={
        <p className="max-w-64 text-sm leading-relaxed">
          {tooltipContent ??
            t(
              'Experimental.Description',
              'This feature is still in development and testing. It may change and can contain bugs.'
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
            'cursor-help border-amber-400/60 bg-amber-50 text-amber-900 shadow-none hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15',
            className
          )}
          icon={<FlaskConical className="h-3 w-3" />}
        >
          {t('Experimental.Label', 'Experimental')}
        </Badge>
      </span>
    </Tooltip>
  );
};

export default Experimental;
