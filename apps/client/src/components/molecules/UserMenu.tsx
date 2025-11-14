import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link, useNavigate } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { CalendarCheck, LogOut, Settings, UserIcon } from 'lucide-react';
import { useAuth } from '../../hooks';
import { PATHNAMES } from '../../lib/paths/pathnames';
import type { User } from '../../types';

interface UserMenuProps {
  user: User;
  t: TFunction;
}

export const UserMenu = ({ user, t }: UserMenuProps) => {
  const { signout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    signout();
    navigate({ ...PATHNAMES.signIn() });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
              {user.initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              👋 Hey, {user.firstname}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.club}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to={'/profile' as any}
            className="flex w-full cursor-pointer items-center"
          >
            <UserIcon className="mr-2 h-4 w-4" />
            <span>{t('Organisms.Navbar.MyProfile')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={'/my-events' as any}
            className="flex w-full cursor-pointer items-center"
          >
            <CalendarCheck className="mr-2 h-4 w-4" />
            <span>{t('Pages.Event.MyEvents')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={'/profile' as any}
            className="flex w-full cursor-pointer items-center"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Notification Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('Organisms.Navbar.LogOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
