import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { FC } from 'react';

export interface UserAvatarProps {
  /** User ID pro načtení dat z cache */
  userId?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  imageUrl?: string | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string | undefined;
  onClick?: (() => void) | undefined;
  alt?: string | undefined;
  /** Zobrazit loading state */
  isLoading?: boolean;
  /** Zobrazit online status */
  showStatus?: boolean;
  /** Online status */
  isOnline?: boolean;
}

export const UserAvatar: FC<UserAvatarProps> = ({
  userId,
  firstName: propFirstName,
  lastName: propLastName,
  imageUrl: propImageUrl,
  size = 'md',
  className,
  onClick,
  alt,
  isLoading = false,
  showStatus = false,
  isOnline = false,
}) => {
  // Načtení uživatelských dat z cache pokud máme userId
  const currentUser = useUser();
  const isCurrentUser = userId === currentUser?.id;

  const userData = isCurrentUser ? currentUser : undefined; // V reálné app byste načítali z cache

  const firstName = propFirstName || userData?.firstname || '';
  const lastName = propLastName || userData?.lastname || '';
  const imageUrl = propImageUrl || userData?.avatarUrl || '';

  const initials =
    `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase();
  const hasImage = Boolean(imageUrl);
  const hasInitials = initials.length > 0;

  // Size variants
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-16 w-16 text-base',
    xl: 'h-20 w-20 text-lg',
  };

  // Status indicator size
  const statusSize = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
    xl: 'h-3.5 w-3.5',
  };

  if (isLoading) {
    return (
      <Skeleton className={cn('rounded-full', sizeClasses[size], className)} />
    );
  }

  return (
    <div className="relative inline-block">
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-semibold uppercase cursor-pointer overflow-hidden border-2 border-border shadow-sm hover:shadow-md transition-all duration-200',
          sizeClasses[size],
          onClick &&
            'hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          !hasImage && !hasInitials && 'bg-muted text-muted-foreground',
          className
        )}
        onClick={onClick}
        role={onClick ? 'button' : 'img'}
        aria-label={alt || `Avatar uživatele ${firstName} ${lastName}`}
        tabIndex={onClick ? 0 : undefined}
      >
        {hasImage ? (
          <img
            src={imageUrl}
            alt={alt || `Profilový obrázek ${firstName} ${lastName}`}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={e => {
              // Fallback na iniciály pokud se obrázek nenačte
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <span className="select-none tracking-wide">
            {hasInitials ? initials : '?'}
          </span>
        )}
      </div>

      {/* Online status indicator */}
      {showStatus && (
        <div
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-background',
            isOnline ? 'bg-green-500' : 'bg-gray-400',
            statusSize[size]
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
