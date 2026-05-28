import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  verifiedAt?: string | Date | null;
  className?: string;
};

export function EmailVerifiedBadge({ verifiedAt, className }: Props) {
  const { t } = useTranslation();

  if (!verifiedAt) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <BadgeCheck
            className={`inline-block h-4 w-4 text-blue-500 ${className ?? ''}`}
            aria-label={t('Components.EmailVerifiedBadge.Label', 'Verified email')}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('Components.EmailVerifiedBadge.Tooltip', 'Verified email')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
