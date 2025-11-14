import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import React from 'react';

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'card' | 'minimal';
  showIcon?: boolean;
  target?: string;
  rel?: string;
}

export const ExternalLink = React.forwardRef<
  HTMLAnchorElement,
  ExternalLinkProps
>(
  (
    {
      href,
      children,
      className = '',
      variant = 'default',
      showIcon = true,
      target = '_blank',
      rel = 'noopener noreferrer',
    },
    ref
  ) => {
    const baseClasses =
      'text-sm font-medium transition-colors hover:text-primary flex items-center gap-1';

    const variantClasses = {
      default: '',
      card: 'p-3 rounded-lg border border-border hover:bg-accent hover:border-primary/20 transition-all duration-200',
      minimal: 'underline underline-offset-4 hover:no-underline',
    };

    const iconClasses = {
      default: 'w-2.5 h-2.5 opacity-60 -mt-1.5',
      card: 'w-4 h-4 opacity-80',
      minimal: 'w-2.5 h-2.5 opacity-60',
    };

    const finalClassName = `${baseClasses} ${variantClasses[variant]} ${className}`;

    return (
      <a
        ref={ref}
        href={href}
        className={finalClassName}
        target={target}
        rel={rel}
      >
        {children}
        {showIcon && <ExternalLinkIcon className={iconClasses[variant]} />}
      </a>
    );
  }
);

ExternalLink.displayName = 'ExternalLink';
