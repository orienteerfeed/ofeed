import { Card, CardContent } from '@/components/ui/card';
import PATHNAMES from '@/lib/paths/pathnames';
import { Link, useLocation } from '@tanstack/react-router';
import { Bell, Menu } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Badge, Button } from '../atoms';
import {
  Dropdown,
  SearchBox,
  ThemeToggleButton,
  UserAvatar,
} from '../molecules';

interface Route {
  name: string;
  path: string;
  layout?: string;
}

interface NavbarProps {
  routes: Route[];
  onOpenSidenav: () => void;
  pageName?: string;
  t: (key: string) => string;
}

interface CurrentRoute {
  name: string;
  path: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  routes,
  onOpenSidenav,
  pageName,
  t,
}) => {
  const location = useLocation();
  const { token, user, signout } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<CurrentRoute>({
    name: '',
    path: PATHNAMES.home().to,
  });

  useEffect(() => {
    getActiveRoute(routes);
  }, [location.pathname, routes]);

  const getActiveRoute = (routes: Route[]) => {
    for (const route of routes) {
      if (window.location.href.includes(route.path)) {
        setCurrentRoute({ name: route.name, path: route.path });
        break;
      }
    }
  };

  return (
    <nav className="sticky top-4 z-40 flex items-center justify-between rounded-xl border bg-background/80 p-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 md:p-4">
      {/* Breadcrumb - Hidden on mobile */}
      <div className="hidden md:flex items-center gap-2">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <Link
            {...PATHNAMES.home()}
            className="transition-colors hover:text-foreground"
          >
            {t('Organisms.Navbar.Pages')}
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <Link
            to={currentRoute.path}
            className="capitalize transition-colors hover:text-foreground"
          >
            {currentRoute.name}
          </Link>
        </div>
        <div className="ml-4">
          <h1 className="text-2xl font-bold tracking-tight">
            <Link
              to={currentRoute.path}
              className="transition-colors hover:text-foreground/80"
            >
              {pageName || currentRoute.name}
            </Link>
          </h1>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-1 items-center justify-end gap-2 md:flex-initial md:gap-4">
        {/* Search Box */}
        <div className="hidden sm:flex flex-1 max-w-sm">
          <SearchBox />
        </div>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden"
          onClick={onOpenSidenav}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Theme Toggle */}
        <ThemeToggleButton />

        {/* Notifications */}
        <Dropdown
          trigger={
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <Badge
                className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                variant="destructive"
              >
                3
              </Badge>
            </Button>
          }
          className="w-80"
        >
          <div className="flex flex-col gap-3 p-1">
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-base font-bold text-foreground">
                Notification
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-sm font-bold"
              >
                Mark all read
              </Button>
            </div>

            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="p-3">
                <div className="flex items-start space-x-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-b from-primary to-primary/60 text-primary-foreground">
                    <Bell className="h-6 w-6" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-bold text-foreground">
                      New Update: Notifications for selected competitors and
                      classes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ... coming soon
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Dropdown>

        {/* User Menu */}
        {token ? (
          <Dropdown
            trigger={
              <Button variant="ghost" className="p-0 h-auto">
                <UserAvatar
                  firstName={user?.firstname}
                  lastName={user?.lastname}
                />
              </Button>
            }
            className="w-56"
          >
            <div className="flex flex-col p-1">
              <div className="p-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground">
                    👋 Hey, {user?.firstname}
                  </p>
                </div>
              </div>
              <div className="h-px bg-border my-1" />

              <div className="flex flex-col space-y-1 p-1">
                <Button
                  variant="ghost"
                  className="justify-start h-auto py-2 px-2 text-sm"
                  asChild
                >
                  <Link {...PATHNAMES.profile()}>
                    {t('Organisms.Navbar.MyProfile')}
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start h-auto py-2 px-2 text-sm"
                >
                  Notification Settings
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start h-auto py-2 px-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={signout}
                >
                  {t('Organisms.Navbar.LogOut')}
                </Button>
              </div>
            </div>
          </Dropdown>
        ) : (
          <Button asChild variant="default" size="sm">
            <Link {...PATHNAMES.signIn()}>{t('Organisms.Navbar.SignIn')}</Link>
          </Button>
        )}
      </div>
    </nav>
  );
};
