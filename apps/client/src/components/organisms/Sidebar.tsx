import { cn } from '@/lib/utils';
import { Link, useLocation } from '@tanstack/react-router';
import { X } from 'lucide-react';
import React from 'react';
import { Button } from '../atoms';

interface Route {
  name: string;
  path: string;
  icon?: React.ReactNode;
}

interface SidebarProps {
  routes: Route[];
  open: boolean;
  onClose: () => void;
}

interface SidebarLinksProps {
  routes: Route[];
}

export const Sidebar: React.FC<SidebarProps> = ({ routes, open, onClose }) => {
  return (
    <div
      className={cn(
        'sm:none duration-175 linear fixed !z-50 flex min-h-screen flex-col bg-background pb-10 shadow-2xl shadow-foreground/5 transition-all md:!z-50 lg:!z-50 xl:!z-0',
        open ? 'translate-x-0' : '-translate-x-96'
      )}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 xl:hidden"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </Button>

      {/* Brand */}
      <div className="mx-[56px] mt-[50px] flex items-center">
        <div className="mt-1 ml-1 h-2.5 text-[26px] font-bold uppercase text-foreground">
          ORIENTEER <span className="font-medium">FEED</span>
        </div>
      </div>

      <div className="mt-[58px] mb-7 h-px bg-border" />

      {/* Navigation */}
      <ul className="mb-auto pt-1">
        <SidebarLinks routes={routes} />
      </ul>
    </div>
  );
};

const SidebarLinks: React.FC<SidebarLinksProps> = ({ routes }) => {
  const location = useLocation();

  const activeRoute = (routePath: string): boolean => {
    if (routePath === '/' && location.pathname === '/') {
      return true;
    }
    return location.pathname.startsWith(routePath) && routePath !== '/';
  };

  const createLinks = (routes: Route[]) => {
    return routes.map((route, index) => {
      const isActive = activeRoute(route.path);

      return (
        <Link key={index} to={route.path}>
          <div className="relative mb-3 flex cursor-pointer">
            <li className="my-[3px] flex cursor-pointer items-center px-8">
              <span
                className={cn(
                  'flex items-center',
                  isActive
                    ? 'font-bold text-primary'
                    : 'font-medium text-muted-foreground'
                )}
              >
                {route.icon}
              </span>
              <p
                className={cn(
                  'leading-1 ml-4 flex',
                  isActive
                    ? 'font-bold text-foreground'
                    : 'font-medium text-muted-foreground'
                )}
              >
                {route.name}
              </p>
            </li>
            {isActive && (
              <div className="absolute right-0 top-px h-9 w-1 rounded-lg bg-primary" />
            )}
          </div>
        </Link>
      );
    });
  };

  return <>{createLinks(routes)}</>;
};
