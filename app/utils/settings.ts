export interface UserSettings {
  threshold: number;
  autoMask: boolean;
  showTooltip: boolean;
  blurIntensity: number;
  theme: 'light' | 'dark' | 'system';
}

export interface UserRules {
  threshold: number;
  blockedWords: string[];
  excludedDomains: string[];
  autoMask: boolean;
  showTooltip: boolean;
}

export const defaultSettings: UserSettings = {
  threshold: 0.6,
  autoMask: true,
  showTooltip: true,
  blurIntensity: 5,
  theme: 'system',
};

export const defaultUserRules: UserRules = {
  threshold: defaultSettings.threshold,
  blockedWords: [],
  excludedDomains: [],
  autoMask: defaultSettings.autoMask,
  showTooltip: defaultSettings.showTooltip,
};

export function normalizeUserRules(value: Partial<UserRules> | undefined): UserRules {
  const threshold = Number(value?.threshold ?? defaultUserRules.threshold);
  return {
    threshold: Number.isFinite(threshold) ? Math.min(0.95, Math.max(0.5, threshold)) : 0.6,
    blockedWords: Array.isArray(value?.blockedWords)
      ? [...new Set(value!.blockedWords.map((word) => String(word).trim().toLocaleLowerCase()).filter(Boolean))]
      : [],
    excludedDomains: Array.isArray(value?.excludedDomains)
      ? [...new Set(value!.excludedDomains.map((domain) => String(domain).trim().toLocaleLowerCase()).filter(Boolean))]
      : [],
    autoMask: value?.autoMask ?? defaultUserRules.autoMask,
    showTooltip: value?.showTooltip ?? defaultUserRules.showTooltip,
  };
}

export function isDomainExcluded(hostname: string, excludedDomains: string[]): boolean {
  const host = hostname.toLocaleLowerCase().replace(/^www\./, '');
  return excludedDomains.some((domain) => {
    const normalized = domain
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '');
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

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

export async function updateUserSettings(updates: Partial<UserSettings>): Promise<void> {
  if (typeof browser === 'undefined') return;
  try {
    const current = await getUserSettings();
    await browser.storage.local.set({ user_settings: { ...current, ...updates } });
  } catch (err) {
    console.error('[Carrot] Failed to update user settings.', err);
  }
}
