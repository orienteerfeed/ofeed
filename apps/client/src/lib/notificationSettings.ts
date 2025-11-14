export const NOTIFICATION_STORAGE_KEY = 'notifications';

export interface NotificationSettings {
  general: {
    sound: boolean;
    push: boolean;
  };
  custom: {
    classes: Record<string, boolean>;
    competitors: Record<string, boolean>;
  };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  general: { sound: true, push: true },
  custom: { classes: {}, competitors: {} },
};

/**
 * Retrieves notification settings from local storage.
 */
export const getNotificationSettings = (): NotificationSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  try {
    const storedSettings = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!storedSettings) {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }

    const parsedSettings = JSON.parse(storedSettings);

    // Validate and merge with default settings to ensure all properties exist
    return {
      general: {
        ...DEFAULT_NOTIFICATION_SETTINGS.general,
        ...parsedSettings.general,
      },
      custom: {
        classes: { ...parsedSettings.custom?.classes },
        competitors: { ...parsedSettings.custom?.competitors },
      },
    };
  } catch (error) {
    console.error(
      'Error parsing notification settings from localStorage:',
      error
    );
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
};

/**
 * Saves notification settings to local storage.
 */
export const saveNotificationSettings = (
  settings: NotificationSettings
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving notification settings to localStorage:', error);
  }
};

/**
 * Toggles a general setting (sound or push notifications).
 */
export const toggleNotificationSetting = (
  type: keyof NotificationSettings['general']
): NotificationSettings => {
  const settings = getNotificationSettings();
  settings.general[type] = !settings.general[type];
  saveNotificationSettings(settings);
  return settings;
};

/**
 * Toggles custom class notifications.
 */
export const toggleClassNotification = (
  className: string
): NotificationSettings => {
  const settings = getNotificationSettings();
  settings.custom.classes[className] = !settings.custom.classes[className];
  saveNotificationSettings(settings);
  return settings;
};

/**
 * Toggles custom competitor notifications.
 */
export const toggleCompetitorNotification = (
  competitorId: string
): NotificationSettings => {
  const settings = getNotificationSettings();
  settings.custom.competitors[competitorId] =
    !settings.custom.competitors[competitorId];
  saveNotificationSettings(settings);
  return settings;
};

/**
 * Checks if a specific class has notifications enabled.
 */
export const isClassNotificationEnabled = (className: string): boolean => {
  const settings = getNotificationSettings();
  return settings.custom.classes[className] ?? true; // Default to true if not specified
};

/**
 * Checks if a specific competitor has notifications enabled.
 */
export const isCompetitorNotificationEnabled = (
  competitorId: string
): boolean => {
  const settings = getNotificationSettings();
  return settings.custom.competitors[competitorId] ?? true; // Default to true if not specified
};

/**
 * Resets notification settings to defaults.
 */
export const resetNotificationSettings = (): NotificationSettings => {
  saveNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
  return DEFAULT_NOTIFICATION_SETTINGS;
};
