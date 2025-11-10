import { cn } from '@/lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export const PasswordStrengthIndicator = ({
  password,
  className,
}: PasswordStrengthIndicatorProps) => {
  const calculateStrength = (
    pwd: string
  ): {
    score: number;
    label: string;
    color: string;
  } => {
    let score = 0;

    // Length check
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;

    // Character variety checks
    if (/[a-z]/.test(pwd)) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^a-zA-Z0-9]/.test(pwd)) score += 1;

    const strengthMap = [
      { label: 'Very Weak', color: 'bg-destructive' },
      { label: 'Weak', color: 'bg-orange-500' },
      { label: 'Fair', color: 'bg-yellow-500' },
      { label: 'Good', color: 'bg-lime-500' },
      { label: 'Strong', color: 'bg-green-500' },
      { label: 'Very Strong', color: 'bg-emerald-600' },
    ];

    const index = Math.min(Math.max(score, 0), strengthMap.length - 1);
    const strengthLevel = strengthMap[index]!;

    return {
      score: (score / 5) * 100,
      label: strengthLevel.label,
      color: strengthLevel.color,
    };
  };

  const strength = calculateStrength(password);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">Password strength:</span>
        <span
          className={cn(
            'font-medium',
            strength.score < 40 && 'text-destructive',
            strength.score >= 40 && strength.score < 80 && 'text-yellow-600',
            strength.score >= 80 && 'text-green-600'
          )}
        >
          {strength.label}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className={cn(
            'h-2 rounded-full transition-all duration-300',
            strength.color
          )}
          style={{ width: `${strength.score}%` }}
        />
      </div>
    </div>
  );
};
