import { cn } from '@/lib/utils';
import { ArrowUp, Check, Info } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive';

interface FloatingBadgeProps {
  title: string;
  className?: string;
  duration?: number;
  showAtScrollY?: number;
  variant?: BadgeVariant;
  showIcon?: boolean;
  position?: 'top' | 'bottom';
  onShow?: () => void;
  onHide?: () => void;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-background/95 text-foreground border-border',
  primary: 'bg-primary/95 text-primary-foreground border-primary/20',
  success: 'bg-green-500/95 text-white border-green-500/20',
  warning: 'bg-amber-500/95 text-white border-amber-500/20',
  destructive:
    'bg-destructive/95 text-destructive-foreground border-destructive/20',
};

const variantIcons: Record<BadgeVariant, React.ReactNode> = {
  default: <ArrowUp className="size-3" />,
  primary: <ArrowUp className="size-3" />,
  success: <Check className="size-3" />,
  warning: <Info className="size-3" />,
  destructive: <Info className="size-3" />,
};

export const FloatingBadge: React.FC<FloatingBadgeProps> = ({
  title,
  className,
  duration = 3000,
  showAtScrollY = 100,
  variant = 'default',
  showIcon = true,
  position = 'top',
  onShow,
  onHide,
}) => {
  const [showBadge, setShowBadge] = useState(false);
  const lastScrollY = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Show badge when scrolling up past threshold
      if (
        currentScrollY < lastScrollY.current &&
        currentScrollY > showAtScrollY
      ) {
        if (!showBadge) {
          setShowBadge(true);
          onShow?.();
        }

        // Clear existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Hide badge after duration
        timeoutRef.current = setTimeout(() => {
          setShowBadge(false);
          onHide?.();
        }, duration);
      }

      // Hide immediately if scrolled to top
      if (currentScrollY <= showAtScrollY && showBadge) {
        setShowBadge(false);
        onHide?.();
      }

      lastScrollY.current = currentScrollY;
    };

    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', throttledScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [duration, showAtScrollY, showBadge, onShow, onHide]);

  const positionStyles = position === 'top' ? 'top-6' : 'bottom-6';

  // Modern Framer Motion variants
  const badgeVariants = {
    hidden: {
      y: position === 'top' ? -60 : 60,
      opacity: 0,
      x: '-50%',
      scale: 0.8,
    },
    visible: {
      y: position === 'top' ? 20 : -20,
      opacity: 1,
      x: '-50%',
      scale: 1,
    },
  };

  const iconVariants = {
    animate: {
      scale: [1, 1.2, 1],
    },
  };

  const transition = {
    type: 'spring' as const,
    stiffness: 300,
    damping: 25,
    duration: 0.3,
  };

  const iconTransition = {
    duration: 2,
    repeat: Infinity,
    repeatType: 'reverse' as const,
  };

  return (
    <motion.div
      variants={badgeVariants}
      initial="hidden"
      animate={showBadge ? 'visible' : 'hidden'}
      transition={transition}
      className={cn(
        'fixed left-1/2 z-50',
        'backdrop-blur supports-[backdrop-filter]:bg-background/80',
        'border shadow-lg shadow-black/5',
        'text-xs font-medium',
        'px-3 py-2 rounded-full',
        'flex items-center gap-2',
        'select-none pointer-events-none',
        'md:hidden',
        variantStyles[variant],
        positionStyles,
        className
      )}
    >
      {showIcon && (
        <motion.span
          variants={iconVariants}
          animate="animate"
          transition={iconTransition}
        >
          {variantIcons[variant]}
        </motion.span>
      )}
      <span>{title}</span>
    </motion.div>
  );
};
