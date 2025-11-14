import { cn } from '@/lib/utils';
import { Link, useLocation } from '@tanstack/react-router';
import { Calendar, CreditCard, Home, Settings } from 'lucide-react';
import React from 'react';
import PATHNAMES from '../../lib/paths/pathnames';

interface NavigationItem {
  path: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
}

interface SideNavigationProps {
  t: (key: string) => string;
}

export const SideNavigation: React.FC<SideNavigationProps> = ({ t }) => {
  const location = useLocation();

  const navigationItems: NavigationItem[] = [
    {
      path: PATHNAMES.home().to,
      icon: <Home className="h-4 w-4" />,
      label: t('Route.Dashboard'),
      exact: true,
    },
    {
      path: PATHNAMES.event().to,
      icon: <Calendar className="h-4 w-4" />,
      label: t('Route.Events'),
    },
    {
      path: '/finances', // TODO: vytvořit path v PATHNAMES
      icon: <CreditCard className="h-4 w-4" />,
      label: t('Route.Finances'),
    },
    {
      path: PATHNAMES.settings().to,
      icon: <Settings className="h-4 w-4" />,
      label: t('Route.Settings'),
    },
  ];

  const isActive = (path: string, exact: boolean = false): boolean => {
    if (exact) {
      return location.pathname === path;
    }
    // Pro nested routes - aktivní pokud current path začíná route path
    return location.pathname.startsWith(path) && path !== '/';
  };

  return (
    <aside className="hidden w-[200px] flex-col md:flex">
      <nav className="grid items-start gap-2">
        {navigationItems.map(item => {
          const active = isActive(item.path, item.exact);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {item.icon}
              <span className="ml-2">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
