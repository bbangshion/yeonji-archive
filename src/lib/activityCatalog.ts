/** A single validated, source-linked catalogue for the profile and timeline. */
import type { SearchLabel } from './searchIndex';

export type ActivityKind = 'milestone' | 'unit' | 'release' | 'concert' | 'appearance';
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['milestone', 'unit', 'release', 'concert', 'appearance'];
export type ActivityRecord = {
  id: string;
  date: string;
  kind: ActivityKind;
  title: SearchLabel;
  description: SearchLabel;
  source: string;
  sourceName?: string;
  scope?: string;
  /** Announced itinerary, NOT yet independently verified as an appearance. */
  scheduled: boolean;
  featured?: boolean;
};
export type ActivityCatalog = { entries: ActivityRecord[]; updatedAt: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isLabel = (value: unknown): value is SearchLabel =>
  isObject(value) && (['ko', 'en', 'ja'] as const).every((lang) => typeof value[lang] === 'string' && (value[lang] as string).trim().length > 0);
export const isValidActivityDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
export const currentLocalDate = (): string => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

export function parseActivityCatalog(raw: unknown): ActivityCatalog {
  const root = isObject(raw) ? raw : {};
  const rows = Array.isArray(raw) ? raw : Array.isArray(root.activities) ? root.activities : [];
  const seen = new Set<string>();
  const entries: ActivityRecord[] = [];
  for (const item of rows) {
    if (!isObject(item) || item.s12 !== true || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) continue;
    if (!isValidActivityDate(item.date) || typeof item.kind !== 'string' || !ACTIVITY_KINDS.includes(item.kind as ActivityKind)) continue;
    if (!isLabel(item.title) || !isLabel(item.description)) continue;
    if (typeof item.source !== 'string' || !/^https:\/\//i.test(item.source)) continue;
    seen.add(item.id);
    entries.push({
      id: item.id, date: item.date, kind: item.kind as ActivityKind,
      title: item.title, description: item.description, source: item.source,
      sourceName: typeof item.sourceName === 'string' ? item.sourceName : undefined,
      scope: typeof item.scope === 'string' && item.scope.trim() ? item.scope : undefined,
      scheduled: item.scheduled === true,
      featured: item.featured === true,
    });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { entries, updatedAt: isValidActivityDate(root.updatedAt) ? root.updatedAt : '' };
}

let pending: Promise<ActivityCatalog> | null = null;
export function loadActivityCatalog(refresh = false): Promise<ActivityCatalog> {
  if (refresh) pending = null;
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/yeonji-activities.json`, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Activity list: ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(parseActivityCatalog)
      .catch((error: unknown) => {
        pending = null; // Allow visitors to retry after a temporary network failure.
        throw error;
      });
  }
  return pending;
}
