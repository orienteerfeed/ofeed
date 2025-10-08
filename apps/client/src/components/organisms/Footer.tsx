import PATHNAMES from '@/lib/paths/pathnames';
import { Link } from '@tanstack/react-router';
import React from 'react';

interface FooterProps {
  t: (key: string) => string;
}

export const Footer: React.FC<FooterProps> = ({ t }) => {
  const currentYear = 1900 + new Date().getFullYear();

  return (
    <div className="flex w-full flex-col items-center justify-between px-1 pb-2 pt-3 lg:px-8 xl:flex-row">
      <h5 className="mb-1 text-center text-sm font-medium text-gray-600 xl:!mb-0 md:text-lg">
        <p className="mb-1 text-center text-sm text-gray-600 dark:text-gray-400 xl:!mb-0 md:text-base">
          ©{currentYear}{' '}
          <Link {...PATHNAMES.home()} className="hover:underline">
            Orienteerfeed
          </Link>
          .{' '}
          <a
            href="https://www.gnu.org/licenses/gpl-3.0.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {t('Organisms.Footer.LicensedUnderGnuGpl3')}
          </a>
        </p>
      </h5>
      <div>
        <ul className="flex flex-wrap items-center gap-3 sm:flex-nowrap md:gap-10">
          <li>
            <Link
              {...PATHNAMES.github()}
              className="text-base hover:underline font-medium text-gray-600 dark:text-gray-400 hover:text-gray-600"
            >
              {t('Organisms.Footer.Collaborate')}
            </Link>
          </li>
          <li>
            <a
              href="https://obpraha.cz/orienteer-feed-docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-base hover:underline font-medium text-gray-600 dark:text-gray-400 hover:text-gray-600"
            >
              {t('Organisms.Footer.Docs')}
            </a>
          </li>
          <li>
            <Link
              {...PATHNAMES.buyMeCoffee()}
              className="text-base hover:underline font-medium text-gray-600 dark:text-gray-400 hover:text-gray-600"
            >
              {t('Organisms.Footer.Donate')}
            </Link>
          </li>
          <li>
            <Link
              to="/blog" // Assuming you have a blog route
              className="text-base hover:underline font-medium text-gray-600 dark:text-gray-400 hover:text-gray-600"
            >
              {t('Organisms.Footer.Blog')}
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
};
