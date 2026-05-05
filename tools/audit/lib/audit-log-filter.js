/**
 * Helix admin log helpers: normalize paths and index preview / live activity.
 */

/**
 * @param {string} route
 * @returns {boolean}
 */
export function isLogPreviewRoute(route) {
  const r = typeof route === 'string' ? route.toLowerCase() : '';
  return r === 'preview' || r === 'preview-job';
}

/**
 * @param {string} route
 * @returns {boolean}
 */
export function isLogLiveRoute(route) {
  const r = typeof route === 'string' ? route.toLowerCase() : '';
  return r === 'live' || r === 'live-job';
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function collectPathStrings(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return [value.trim()];
}

/**
 * @param {unknown} entry
 * @param {(raw: string) => string} normalizeKey
 * @param {Set<string>} previewKeys
 * @param {Set<string>} liveKeys
 */
function indexLogEntry(entry, normalizeKey, previewKeys, liveKeys) {
  const route = entry?.route;
  const preview = isLogPreviewRoute(route);
  const live = isLogLiveRoute(route);
  if (!preview && !live) return;

  const keys = new Set();
  collectPathStrings(entry?.path).forEach((p) => {
    const k = normalizeKey(p);
    if (k) keys.add(k);
  });
  const paths = entry?.paths;
  if (Array.isArray(paths)) {
    paths.forEach((p) => {
      const k = normalizeKey(p);
      if (k) keys.add(k);
    });
  }

  keys.forEach((key) => {
    if (preview) previewKeys.add(key);
    if (live) liveKeys.add(key);
  });
}

/**
 * @param {unknown[]} entries
 * @param {(raw: string) => string} normalizeKey
 * @returns {{ previewKeys: Set<string>, liveKeys: Set<string> }}
 */
export function buildLogPathIndex(entries, normalizeKey) {
  const previewKeys = new Set();
  const liveKeys = new Set();
  const list = Array.isArray(entries) ? entries : [];
  list.forEach((entry) => indexLogEntry(entry, normalizeKey, previewKeys, liveKeys));
  return { previewKeys, liveKeys };
}

/**
 * @param {{ path: string }} result
 * @param {Set<string>} previewKeys
 * @param {Set<string>} liveKeys
 * @param {{ matchPreview: boolean, matchLive: boolean }} options
 * @param {(raw: string) => string} resultKeyFn
 * @returns {boolean}
 */
export function resultMatchesLogFilter(result, previewKeys, liveKeys, options, resultKeyFn) {
  const key = resultKeyFn(result?.path);
  if (!key) return false;

  const needPreview = Boolean(options.matchPreview);
  const needLive = Boolean(options.matchLive);

  if (!needPreview && !needLive) return true;

  const inPreview = previewKeys.has(key);
  const inLive = liveKeys.has(key);

  // Both on = union: path may appear only in preview (typical) or only in live/publish.
  if (needPreview && needLive) return inPreview || inLive;
  if (needPreview) return inPreview;
  return inLive;
}
