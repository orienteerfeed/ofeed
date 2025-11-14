import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsAuthenticated, useUser } from '@/stores/auth/auth-store';
import { Link } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { Menu, User } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from '../../templates/MainPageLayout';
import { ExternalLink } from '../atoms';
import {
  EventSearchDialog,
  LanguageSelector,
  NotificationBell,
  ThemeToggleButton,
  UserMenu,
} from '../molecules';

interface NavbarProps {
  navLinks: NavLink[];
  t: TFunction;
}

export function Navbar({ navLinks, t }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isLoggedIn = useIsAuthenticated();
  const user = useUser();

  // Generate initials from user name
  const getInitials = (...parts: Array<string | undefined | null>) => {
    const letters = parts
      .flatMap(p => (p ?? '').trim().split(/\s+/)) // rozdělit víceslovná jména
      .filter(Boolean)
      .map(s => s[0] as string);

    return letters.join('').toUpperCase().slice(0, 2);
  };

  // Use with separately stored first and last names
  const userWithInitials = user
    ? {
        ...user,
        initials: getInitials(user.firstname, user.lastname),
      }
    : undefined;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo - vlevo */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2"
          activeProps={{
            className: 'text-primary',
          }}
        >
          <div className="text-2xl font-bold tracking-tight md:text-3xl">
            <span className="text-primary">O</span>FEED
          </div>
        </Link>

        {/* Desktop Navigation - uprostřed */}
        <nav className="hidden flex-1 items-center justify-center gap-6 md:flex">
          {navLinks.map(link =>
            link.external ? (
              <ExternalLink key={link.path} href={link.path}>
                {link.label}
              </ExternalLink>
            ) : (
              <Link
                key={link.path}
                to={link.path}
                className="text-sm font-medium transition-colors hover:text-primary"
                activeProps={{
                  className: 'text-primary font-semibold',
                }}
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        {/* Desktop Actions - vpravo */}
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1 sm:flex">
            <EventSearchDialog />
            {isLoggedIn && <NotificationBell />}
            <LanguageSelector />
            <ThemeToggleButton />
          </div>

          {/* User Menu / Sign In */}
          {isLoggedIn && userWithInitials ? (
            <UserMenu user={userWithInitials} t={t} />
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/auth/signin">
                <User className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Sign In</span>
              </Link>
            </Button>
          )}

          {/* Mobile Menu Trigger - vpravo v mobilním zobrazení */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="sm" className="ml-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="flex flex-col gap-6">
                {/* Mobile Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <EventSearchDialog />
                    {isLoggedIn && <NotificationBell />}
                    <LanguageSelector />
                    <ThemeToggleButton />
                  </div>
                </div>

                {/* Mobile Navigation - roztažený obsah */}
                <nav className="flex flex-col gap-4">
                  {navLinks.map(link =>
                    link.external ? (
                      <a
                        key={link.path}
                        href={link.path}
                        className="flex items-center justify-between py-2 text-lg font-medium transition-colors hover:text-primary"
                        onClick={() => setIsOpen(false)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                        <span className="text-xs text-muted-foreground">
                          ↗
                        </span>
                      </a>
                    ) : (
                      <Link
                        key={link.path}
                        to={link.path}
                        className="flex items-center justify-between py-2 text-lg font-medium transition-colors hover:text-primary"
                        activeProps={{
                          className: 'text-primary font-semibold',
                        }}
                        onClick={() => setIsOpen(false)}
                      >
                        {link.label}
                      </Link>
                    )
                  )}
                </nav>

                {/* User Info / Sign In v mobilním menu */}
                {isLoggedIn && userWithInitials ? (
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {userWithInitials.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {userWithInitials.firstname}{' '}
                          {userWithInitials.lastname}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {userWithInitials.club}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t pt-4">
                    <Button variant="outline" className="w-full" asChild>
                      <Link to="/auth/signin" onClick={() => setIsOpen(false)}>
                        <User className="mr-2 h-4 w-4" />
                        Sign In
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
