import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { config } from '@/config';
import { TFunction } from 'i18next';
import { Code2, Mail, MessageCircle } from 'lucide-react';
import React from 'react';

interface TroubleShootingCardProps {
  t: TFunction;
  title?: string;
  description?: string;
  /** Přepíše implicitní Discord URL z configu (pokud existuje) */
  discordUrl?: string;
  /** Přepíše implicitní GitHub issues URL z configu (pokud existuje) */
  githubIssuesUrl?: string;
}

export const TroubleShootingCard: React.FC<TroubleShootingCardProps> = ({
  t,
  title,
  description,
  discordUrl,
  githubIssuesUrl,
}) => {
  const resolvedDiscordUrl = discordUrl || config.DISCORD_INVITE_URL || undefined;
  const resolvedGithubIssuesUrl =
    githubIssuesUrl || `${config.GITHUB_REPO_URL}/issues` || undefined;

  return (
    <Card className="w-full border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-blue-700 dark:text-blue-300 text-lg">
              {title ||
                t('Pages.Event.TroublesShooting.Title', {
                  defaultValue: 'Potřebujete pomoc?',
                })}
            </CardTitle>
            <CardDescription className="text-sm mt-1 text-muted-foreground">
              {description || t('Pages.Event.TroublesShooting.Description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t('Pages.Event.TroublesShooting.Description1')}{' '}
          <a
            href={`mailto:${config.SUPPORT_EMAIL}`}
            className="text-blue-600 hover:underline dark:text-blue-400 font-medium"
          >
            {config.SUPPORT_EMAIL}
          </a>
          {'. '}
          {t('Pages.Event.TroublesShooting.Description2')}
        </p>

        {/* Badge / tlačítka na komunitu */}
        <div className="flex flex-wrap gap-2 pt-1">
          {resolvedDiscordUrl && (
            <a
              href={resolvedDiscordUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
            >
              <MessageCircle className="h-3 w-3" />
              {t('Pages.Event.TroublesShooting.Discord')}
            </a>
          )}

          {resolvedGithubIssuesUrl && (
            <a
              href={resolvedGithubIssuesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Code2 className="h-3 w-3" />
              {t('Pages.Event.TroublesShooting.GitHubIssues')}
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
