export interface UserSettings {
  threshold: number;       // 0.50~0.95, default 0.75
  autoMask: boolean;       // default true
  showTooltip: boolean;    // default true
  blurIntensity: number;   // px, default 5
  theme: 'light' | 'dark' | 'system'; // default system
}

export const defaultSettings: UserSettings = {
  threshold: 0.75,
  autoMask: true,
  showTooltip: true,
  blurIntensity: 5,
  theme: 'system',
};

/**
 * Retrieves the current user settings from browser.storage.local.
 * Fills in any missing fields with defaults.
 */
export async function getUserSettings(): Promise<UserSettings> {
  if (typeof browser === 'undefined') return defaultSettings;
  try {
    const data = await browser.storage.local.get('user_settings');
    const stored = data.user_settings as Partial<UserSettings> | undefined;
    return { ...defaultSettings, ...stored };
  } catch (err) {
    console.warn('[Carrot] Failed to get user settings, using defaults.', err);
    return defaultSettings;
  }
}

/**
 * Updates the given fields in user settings.
 */
export async function updateUserSettings(updates: Partial<UserSettings>): Promise<void> {
  if (typeof browser === 'undefined') return;
  try {
    const current = await getUserSettings();
    const updated = { ...current, ...updates };
    await browser.storage.local.set({ user_settings: updated });
  } catch (err) {
    console.error('[Carrot] Failed to update user settings.', err);
  }
}
