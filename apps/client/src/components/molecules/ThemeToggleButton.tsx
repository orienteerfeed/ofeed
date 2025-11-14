import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../atoms';

export const ThemeToggleButton = () => {
  const { t } = useTranslation('common');
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="w-9 h-9">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';
  const label = t('Theme.Toggle', { ns: 'common' });
  const toggle = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={resolvedTheme}
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={toggle}
          className="h-9 w-9"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </motion.div>
    </AnimatePresence>
  );
};

export default ThemeToggleButton;
