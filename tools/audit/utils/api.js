/**
 * DA APIs used by the audit tool.
 */

const ADMIN_HLX_BASE_URL = 'https://admin.hlx.page';
const VERSION_API_BASE_URL = 'https://admin.da.live';
const DEFAULT_LOG_REF = 'main';
const SEARCHABLE_FILE_EXTENSIONS = new Set(['html', 'json', 'svg', 'md']);

function stripKnownContentExtensions(path) {
  return path
    .replace(/\.plain\.html$/i, '')
    .replace(/\.html$/i, '')
    .replace(/\.md$/i, '')
    .replace(/\.json$/i, '');
}

function sanitizeAndNormalizePath(documentPath, org = '', site = '') {
  const trimmedPath = documentPath?.trim() || '';
  if (!trimmedPath) return '';

  let normalizedPath = trimmedPath;

  // Accept full URLs from preview/live/editor and keep only the pathname.
  if (/^https?:\/\//i.test(normalizedPath)) {
    try {
      normalizedPath = new URL(normalizedPath).pathname;
    } catch {
      // Keep the original input if URL parsing fails.
    }
  }

  try {
    normalizedPath = decodeURIComponent(normalizedPath);
  } catch {
    // Keep the raw path when URI decoding fails.
  }
  normalizedPath = normalizedPath.replace(/\/+/g, '/');
  normalizedPath = normalizedPath.replace(/\/+$/, '');
  if (!normalizedPath.startsWith('/')) normalizedPath = `/${normalizedPath}`;
  if (normalizedPath === '/') return '';

  const segments = normalizedPath.split('/').filter(Boolean);
  const orgLower = org.toLowerCase();
  const siteLower = site.toLowerCase();

  if (segments.length >= 2
    && segments[0].toLowerCase() === orgLower
    && segments[1].toLowerCase() === siteLower) {
    const strippedPath = `/${segments.slice(2).join('/')}`;
    return strippedPath === '/' ? '' : strippedPath;
  }

  if (segments.length >= 1 && segments[0].toLowerCase() === siteLower) {
    const strippedPath = `/${segments.slice(1).join('/')}`;
    return strippedPath === '/' ? '' : strippedPath;
  }

  return normalizedPath;
}

function encodePath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Canonical path key for matching list/search paths to Helix log `path` / `paths` values.
 * @param {string} documentPath
 * @param {string} org
 * @param {string} site
 * @returns {string}
 */
export function normalizeAuditContentKey(documentPath, org, site) {
  const normalizedPath = sanitizeAndNormalizePath(documentPath, org, site);
  if (!normalizedPath) return '';
  const stripped = stripKnownContentExtensions(normalizedPath);
  if (!stripped || stripped === '/') return '';
  return stripped;
}

function getVersionPath(documentPath, org, site) {
  const normalizedPath = sanitizeAndNormalizePath(documentPath, org, site);
  if (!normalizedPath) return '';
  const normalizedWithKnownHtml = normalizedPath.replace(/\.plain\.html$/i, '.html');
  if (/\.[^/]+$/i.test(normalizedWithKnownHtml)) {
    return normalizedWithKnownHtml;
  }
  const basePath = stripKnownContentExtensions(normalizedWithKnownHtml);
  if (!basePath || basePath === '/') return '';
  return `${basePath}.html`;
}

function getListPath(documentPath, org, site) {
  const normalizedPath = sanitizeAndNormalizePath(documentPath, org, site);
  return normalizedPath.replace(/^\/+/, '');
}

function normalizeListResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalizeExt(item) {
  const ext = item?.ext || '';
  return ext.toLowerCase();
}

function matchesTerm(value, term) {
  if (!value) return false;
  return value.toLowerCase().includes(term.toLowerCase());
}

function formatResponseForLog(payload, maxLength = 5000) {
  if (typeof payload === 'string') {
    return payload.length > maxLength ? `${payload.slice(0, maxLength)}...` : payload;
  }

  try {
    const json = JSON.stringify(payload);
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
  } catch {
    return '[unserializable response payload]';
  }
}

function isAuthenticationStatus(status) {
  return status === 401 || status === 403;
}

export function authenticationErrorMessage() {
  return 'Authentication is required. Please sign in to continue.';
}

function isAuthenticationError(error) {
  return error instanceof Error && error.message === authenticationErrorMessage();
}

async function fetchJSON(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const rawBody = await response.text();
  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = rawBody;
  }

  if (!response.ok) {
    if (isAuthenticationStatus(response.status)) {
      throw new Error(authenticationErrorMessage());
    }
    throw new Error(`Request failed: ${response.status} ${response.statusText}. Response: ${formatResponseForLog(payload, 500)}`);
  }

  return payload;
}

async function fetchText(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (isAuthenticationStatus(response.status)) {
      throw new Error(authenticationErrorMessage());
    }
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function toAbsoluteVersionSourceUrl(versionUrl) {
  const raw = typeof versionUrl === 'string' ? versionUrl.trim() : '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${VERSION_API_BASE_URL}${raw}`;
  return `${VERSION_API_BASE_URL}/${raw}`;
}

/**
 * Fetches Helix admin log entries for a time range (`from` / `to`, ISO-8601).
 * @see https://www.aem.live/docs/admin.html#tag/log
 */
export async function fetchAdminLog(org, site, token, options = {}) {
  if (!org?.trim()) return { success: false, error: 'Organization is required' };
  if (!site?.trim()) return { success: false, error: 'Site is required' };

  const from = typeof options.from === 'string' ? options.from.trim() : '';
  const to = typeof options.to === 'string' ? options.to.trim() : '';
  if (!from || !to) {
    return { success: false, error: 'Log request requires both from and to.' };
  }

  const ref = typeof options.ref === 'string' && options.ref.trim()
    ? options.ref.trim()
    : DEFAULT_LOG_REF;

  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);

  try {
    const logUrl = `${ADMIN_HLX_BASE_URL}/log/${encodeURIComponent(org)}/${encodeURIComponent(site)}/${encodeURIComponent(ref)}?${params}`;
    const payload = await fetchJSON(logUrl, token);
    const entries = Array.isArray(payload?.entries)
      ? payload.entries
      : (Array.isArray(payload) ? payload : []);
    return {
      success: true,
      entries: Array.isArray(entries) ? entries : [],
      from: payload?.from,
      to: payload?.to,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Log request failed.',
    };
  }
}

/**
 * Fetches version history for a specific content path.
 */
export async function fetchVersionTimeline(org, site, documentPath, token) {
  const versionPath = getVersionPath(documentPath, org, site);

  if (!org?.trim()) return { success: false, error: 'Organization is required' };
  if (!site?.trim()) return { success: false, error: 'Site is required' };
  if (!versionPath) return { success: false, error: 'Path is required' };

  try {
    const versionUrl = `${VERSION_API_BASE_URL}/versionlist/${encodeURIComponent(org)}/${encodeURIComponent(site)}${encodePath(versionPath)}`;
    const versionsPayload = await fetchJSON(versionUrl, token);
    const versions = Array.isArray(versionsPayload)
      ? versionsPayload
      : versionsPayload?.data || versionsPayload?.versions || versionsPayload?.items || [];
    return { success: true, versions: Array.isArray(versions) ? versions : [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetches latest source content for a path.
 */
export async function fetchLatestDocumentSource(org, site, documentPath, token) {
  const versionPath = getVersionPath(documentPath, org, site);
  if (!org?.trim()) return { success: false, error: 'Organization is required' };
  if (!site?.trim()) return { success: false, error: 'Site is required' };
  if (!versionPath) return { success: false, error: 'Path is required' };

  try {
    const sourceUrl = `${VERSION_API_BASE_URL}/source/${encodeURIComponent(org)}/${encodeURIComponent(site)}${encodePath(versionPath)}`;
    const source = await fetchText(sourceUrl, token);
    return { success: true, source };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load latest source.',
    };
  }
}

/**
 * Fetches content for a specific version URL from versionlist entries.
 */
export async function fetchVersionSourceByUrl(versionUrl, token) {
  const resolvedUrl = toAbsoluteVersionSourceUrl(versionUrl);
  if (!resolvedUrl) return { success: false, error: 'Version source URL is required' };

  try {
    const source = await fetchText(resolvedUrl, token);
    return { success: true, source };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load version source.',
    };
  }
}

/**
 * Searches content by filename/path and source contents.
 */
export async function searchContentPaths(org, site, term, token, options = {}) {
  if (!org?.trim()) return { success: false, error: 'Organization is required' };
  if (!site?.trim()) return { success: false, error: 'Site is required' };
  if (!term?.trim()) return { success: false, error: 'Search term is required' };

  const fullTextSearch = options.fullTextSearch !== false;
  const maxResults = Number.isFinite(options.maxResults) ? options.maxResults : 100;
  const maxFiles = Number.isFinite(options.maxFiles) ? options.maxFiles : 500;
  const concurrency = Number.isFinite(options.concurrency) ? options.concurrency : 8;

  const directories = [''];
  const visitedDirectories = new Set(['']);
  const searchableFiles = [];

  try {
    while (directories.length > 0 && searchableFiles.length < maxFiles) {
      const directory = directories.shift();
      const listSuffix = directory ? `/${encodePath(directory)}` : '';
      const listUrl = `${VERSION_API_BASE_URL}/list/${encodeURIComponent(org)}/${encodeURIComponent(site)}${listSuffix}`;
      const itemsPayload = await fetchJSON(listUrl, token);
      const items = normalizeListResponse(itemsPayload);

      for (const item of items) {
        if (!item?.path) continue;

        if (!item.ext) {
          const relativeDirectory = getListPath(item.path, org, site);
          if (relativeDirectory && !visitedDirectories.has(relativeDirectory)) {
            visitedDirectories.add(relativeDirectory);
            directories.push(relativeDirectory);
          }
          continue;
        }

        const ext = normalizeExt(item);
        if (!SEARCHABLE_FILE_EXTENSIONS.has(ext)) continue;

        searchableFiles.push(item);
        if (searchableFiles.length >= maxFiles) break;
      }
    }
  } catch (error) {
    if (isAuthenticationError(error)) {
      return { success: false, error: authenticationErrorMessage() };
    }
    return { success: false, error: `Search scope failed: ${error.message}` };
  }

  const dedupedPaths = new Set();
  const results = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < searchableFiles.length && results.length < maxResults) {
      const file = searchableFiles[cursor];
      cursor += 1;

      const filePath = file.path || '';
      const normalizedPath = sanitizeAndNormalizePath(filePath, org, site);
      if (!normalizedPath) continue;
      if (dedupedPaths.has(normalizedPath)) continue;

      const filename = filePath.split('/').pop() || '';
      const matchedByPath = matchesTerm(normalizedPath, term)
        || matchesTerm(filename, term);

      let matchedByContent = false;
      if (fullTextSearch && !matchedByPath) {
        try {
          const sourceText = await fetchText(`${VERSION_API_BASE_URL}/source${filePath}`, token);
          matchedByContent = matchesTerm(sourceText, term);
        } catch {
          // Ignore source read errors for individual files and continue.
        }
      }

      if (matchedByPath || matchedByContent) {
        dedupedPaths.add(normalizedPath);
        results.push({
          path: normalizedPath,
          lastModified: file.lastModified || null,
        });
      }
    }
  };

  try {
    const workers = [];
    const workerCount = Math.max(1, Math.min(concurrency, searchableFiles.length || 1));
    for (let i = 0; i < workerCount; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
  } catch (error) {
    if (isAuthenticationError(error)) {
      return { success: false, error: authenticationErrorMessage() };
    }
    return { success: false, error: `Search failed: ${error.message}` };
  }

  results.sort((left, right) => (left.path > right.path ? 1 : -1));
  return {
    success: true,
    results,
    scanned: searchableFiles.length,
  };
}
