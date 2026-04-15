import { get } from '../../db.js';
import { getSyncState } from './appStateService.js';
import { nextSyncAllowedAt } from './catalogService.js';
import { listCarryCategories } from './carryService.js';
import { getPriceCheckCategoriesWithPages } from './priceCheckService.js';
import { getWeeklyCalendar } from './calendarService.js';

export async function getHomeState(user) {
  const [carryCategories, priceCheckCategories, sync, calendar, syncedAtRow] = await Promise.all([
    listCarryCategories(),
    getPriceCheckCategoriesWithPages(),
    getSyncState(),
    getWeeklyCalendar(),
    get(`SELECT value FROM app_state WHERE key = 'catalog_synced_at'`),
  ]);

  return {
    role: user.role,
    user: {
      id: Number(user.id),
      login: user.login,
      role: user.role,
    },
    carryCategories,
    priceCheckCategories,
    calendar,
    syncedAt: Number(syncedAtRow?.value || 0) || null,
    sync: {
      ...sync,
      nextAllowedAt: nextSyncAllowedAt(sync),
    },
  };
}
