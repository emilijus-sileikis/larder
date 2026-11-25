import { Platform } from 'react-native';
import {
  AndroidImportance,
  cancelAllScheduledNotificationsAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import type { Language } from '@/i18n/translations';
import type { PantryItem } from '@/types/larder';
import { addDaysIso, parseIsoDate } from '@/utils/dates';

const CHANNEL_ID = 'larder-expiry';

let handlerConfigured = false;

export function ensureNotificationHandler(): void {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;
  try {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Ignore in unsupported environments
  }
}

export async function requestExpiryNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    ensureNotificationHandler();
    if (Platform.OS === 'android') {
      await setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Expiry Reminders',
        importance: AndroidImportance.DEFAULT,
        lightColor: '#4A7C59',
      });
    }
    const existing = await getPermissionsAsync();
    if (existing.granted) return true;
    const req = await requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

export async function cancelAllExpiryNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await cancelAllScheduledNotificationsAsync();
  } catch {
    // Ignore errors in unsupported environments
  }
}

/**
 * Schedules local 09:00 AM reminders 1 day before each in-stock/low pantry item expires
 * (grouped by reminder date so you get one clean digest per morning, never spam).
 */
export async function syncExpiryNotifications(
  pantryItems: PantryItem[],
  enabled: boolean,
  lang: Language
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await cancelAllScheduledNotificationsAsync();
    if (!enabled) return;

    const perm = await getPermissionsAsync();
    if (!perm.granted) return;

    ensureNotificationHandler();
    if (Platform.OS === 'android') {
      await setNotificationChannelAsync(CHANNEL_ID, {
        name: lang === 'lt' ? 'Galiojimo priminimai' : 'Expiry Reminders',
        importance: AndroidImportance.DEFAULT,
        lightColor: '#4A7C59',
      });
    }

    const byReminderDate = new Map<string, string[]>();
    const now = Date.now();

    for (const item of pantryItems) {
      if (item.stockLevel === 'out' || !item.expiresAt) continue;
      if (!parseIsoDate(item.expiresAt)) continue;
      const reminderIso = addDaysIso(item.expiresAt, -1);
      const list = byReminderDate.get(reminderIso) ?? [];
      list.push(item.name);
      byReminderDate.set(reminderIso, list);
    }

    const sortedDates = Array.from(byReminderDate.keys()).sort().slice(0, 20);
    for (const dateIso of sortedDates) {
      const parsed = parseIsoDate(dateIso);
      if (!parsed) continue;
      parsed.setHours(9, 0, 0, 0);
      if (parsed.getTime() <= now + 60_000) continue;

      const names = byReminderDate.get(dateIso) ?? [];
      const preview =
        names.length <= 3
          ? names.join(', ')
          : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;

      await scheduleNotificationAsync({
        content: {
          title:
            lang === 'lt'
              ? 'Larder: greitai baigsis galiojimas'
              : 'Larder: Expiring Tomorrow',
          body:
            lang === 'lt'
              ? `Panaudokite rytoj: ${preview}`
              : `Use soon before it expires: ${preview}`,
          sound: true,
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: parsed,
          channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        },
      });
    }
  } catch {
    // Never crash UI on notification scheduling errors
  }
}
