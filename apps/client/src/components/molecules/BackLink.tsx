import { cn } from '@/lib/utils';
import type { CommonTranslationKeys } from '@/types/i18n';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';

export interface BackLinkProps {
  to: string;
  replace?: boolean;
  className?: string;
  iconClassName?: string;
  labelKey?: CommonTranslationKeys;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export const BackLink: FC<BackLinkProps> = ({
  to,
  replace = false,
  className,
  iconClassName,
  labelKey = 'Back',
  ariaLabel,
  children,
}) => {
  const { t } = useTranslation('common');
  const label = children ?? t(labelKey);
  const aria =
    ariaLabel ??
    (typeof label === 'string' ? label : String(t(labelKey)));

  return (
    <Link
      to={to}
      replace={replace}
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium hover:underline',
        className
      )}
      {...(aria ? { 'aria-label': aria } : {})}
    >
      <ArrowLeft className={cn('h-4 w-4', iconClassName)} aria-hidden="true" />
      {label}
    </Link>
  );
};
