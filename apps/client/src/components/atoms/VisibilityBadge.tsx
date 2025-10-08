// src/components/atoms/VisibilityBadge.tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export type VisibilityBadgeProps = {
  isPublic: boolean;
  className?: string;
};

export function VisibilityBadge({ isPublic, className }: VisibilityBadgeProps) {
  const { t } = useTranslation('common');

  return (
    <Badge
      // keep shadcn defaults; only append minimal text styling
      className={cn('uppercase text-xs font-bold', className)}
      // pick a subtle contrast for private, normal for public
      {...(isPublic ? {} : { variant: 'secondary' })}
    >
      {isPublic ? t('Public') : t('Private')}
    </Badge>
  );
}
