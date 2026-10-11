import { Link } from '@tanstack/react-router';
import { ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import PATHNAMES from '@/lib/paths/pathnames';
import { useCartCount } from '@/stores/cart';
import { Button } from '../atoms';

/**
 * Navbar checkout icon with the number of entries waiting in the cart.
 * Hidden while the cart is empty.
 */
export const CartButton = () => {
  const { t } = useTranslation();
  const count = useCartCount();

  if (count === 0) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative"
      aria-label={t('Pages.Checkout.CartAriaLabel', { count })}
      asChild
    >
      <Link {...PATHNAMES.checkout()}>
        <ShoppingCart className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {count}
        </span>
      </Link>
    </Button>
  );
};
