import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector, ThemeToggleButton } from '../components/molecules';

type TFunction = ReturnType<typeof useTranslation>['t'];

interface AuthPageLayoutProps {
  children: React.ReactNode;
  t: TFunction;
  pageName?: string;
}

export const AuthPageLayout: React.FC<AuthPageLayoutProps> = ({
  children,
  t,
}) => {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        {/* Back button */}
        <Link
          to="/"
          className="absolute left-4 top-4 md:left-8 md:top-8 flex items-center text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          {t('Back', { ns: 'common' })}
        </Link>

        {/* Language selector and theme toggle */}
        <div className="absolute right-4 top-4 md:right-8 md:top-8">
          <div className="flex items-center gap-1">
            <LanguageSelector />
            <ThemeToggleButton />
          </div>
        </div>

        {children}
      </div>
    </div>
  );
};
