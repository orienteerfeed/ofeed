import { cn } from '@/lib/utils';

interface CountryFlagProps {
  countryCode: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

export const CountryFlag = ({
  countryCode,
  size = 'md',
  className,
}: CountryFlagProps) => {
  const sizeClasses = {
    xs: 'w-4 h-3 text-xs',
    sm: 'w-5 h-4 text-xs',
    md: 'w-6 h-4 text-sm',
    lg: 'w-8 h-6 text-base',
    xl: 'w-10 h-7 text-lg',
    '2xl': 'w-12 h-8 text-xl',
  };

  return (
    <img
      src={`https://flagcdn.com/${countryCode.toLowerCase()}.svg`}
      alt={`Flag of ${countryCode.toUpperCase()}`}
      className={cn(
        'inline-block object-cover rounded-sm border border-muted/30 shadow-sm',
        sizeClasses[size],
        className
      )}
      loading="lazy" // Lazy loading pro lepší performance
    />
  );
};
