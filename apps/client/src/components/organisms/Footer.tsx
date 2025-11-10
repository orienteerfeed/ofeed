import { TFunction } from 'i18next';
import { Code2, Coffee, Heart, MessageCircle } from 'lucide-react';
import React from 'react';
import { externalLinks } from '../../lib/paths/externalLinks';
import { ExternalLink, Tooltip } from '../atoms';

interface FooterProps {
  t: TFunction;
}

export const Footer: React.FC<FooterProps> = ({ t }) => {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    {
      href: externalLinks.buyMeCoffee,
      icon: Coffee,
      label: t('Organisms.Footer.Donate'),
    },
    {
      href: externalLinks.discord,
      icon: MessageCircle,
      label: 'Discord',
    },
    {
      href: externalLinks.github,
      icon: Code2,
      label: t('Organisms.Footer.Collaborate'),
    },
  ];

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Copyright + License + Heart */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>©{currentYear} Orienteerfeed</span>
            <span className="text-muted-foreground/50">•</span>
            <ExternalLink
              href="https://www.gnu.org/licenses/gpl-3.0.html"
              variant="minimal"
              className="text-sm text-muted-foreground hover:text-foreground"
              showIcon={true}
            >
              GPL v3
            </ExternalLink>
            <span className="text-muted-foreground/50">•</span>
            <div className="flex items-center gap-1">
              <span className="text-xs">{t('Organisms.Footer.MadeWith')}</span>
              <Heart className="w-3 h-3 fill-red-500 text-red-500" />
              <span className="text-xs">
                {t('Organisms.Footer.ForOrienteering')}
              </span>
            </div>
          </div>

          {/* Right side - Social links with tooltips */}
          <div className="flex items-center gap-1">
            {socialLinks.map(social => {
              const Icon = social.icon;
              return (
                <Tooltip
                  key={social.label}
                  content={social.label}
                  side="top"
                  align="center"
                  sideOffset={8}
                >
                  <div>
                    <ExternalLink
                      href={social.href}
                      variant="minimal"
                      className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-accent rounded"
                      showIcon={false}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="sr-only">{social.label}</span>
                    </ExternalLink>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
};
