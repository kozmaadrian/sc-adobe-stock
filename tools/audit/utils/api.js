/**
 * DA APIs used by the audit tool.
 */

const STATUS_API_BASE_URL = 'https://admin.hlx.page';
const VERSION_API_BASE_URL = 'https://admin.da.live';
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

function getStatusPath(documentPath, org, site) {
  const normalizedPath = sanitizeAndNormalizePath(documentPath, org, site);
  const statusPath = stripKnownContentExtensions(normalizedPath);
  return statusPath === '/' ? '' : statusPath;
}

function getVersionPath(documentPath, org, site) {
  const normalizedPath = sanitizeAndNormalizePath(documentPath, org, site);
  if (!normalizedPath) return '';
  const basePath = stripKnownContentExtensions(normalizedPath);
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
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Fetches content status from the Helix status endpoint.
 */
export async function fetchStatusReport(org, site, documentPath, token) {
  const statusPath = getStatusPath(documentPath, org, site);

  if (!org?.trim()) return { success: false, error: 'Organization is required' };
  if (!site?.trim()) return { success: false, error: 'Site is required' };
  if (!statusPath) return { success: false, error: 'Path is required' };

  try {
    const statusUrl = `${STATUS_API_BASE_URL}/status/${encodeURIComponent(org)}/${encodeURIComponent(site)}/main${encodePath(statusPath)}`;
    const statusPayload = await fetchJSON(statusUrl, token);
    const status = statusPayload?.data && typeof statusPayload.data === 'object'
      ? statusPayload.data
      : statusPayload;
    return { success: true, status };
  } catch (error) {
    return { success: false, error: error.message };
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
    while (directories.length > 0) {
      const directory = directories.shift();
      const listSuffix = directory ? `/${encodePath(directory)}` : '';
      const listUrl = `${VERSION_API_BASE_URL}/list/${encodeURIComponent(org)}/${encodeURIComponent(site)}${listSuffix}`;
      const itemsPayload = await fetchJSON(listUrl, token);
      const items = normalizeListResponse(itemsPayload);

      items.forEach((item) => {
        if (!item?.path) return;

        if (!item.ext) {
          const relativeDirectory = getListPath(item.path, org, site);
          if (relativeDirectory && !visitedDirectories.has(relativeDirectory)) {
            visitedDirectories.add(relativeDirectory);
            directories.push(relativeDirectory);
          }
          return;
        }

        const ext = normalizeExt(item);
        if (!SEARCHABLE_FILE_EXTENSIONS.has(ext)) return;
        if (searchableFiles.length >= maxFiles) return;

        searchableFiles.push(item);
      });
    }
  } catch (error) {
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
          name: file.name || filename.replace(/\.[^.]+$/, ''),
          ext: normalizeExt(file),
          lastModified: file.lastModified || null,
          matchType: matchedByPath && matchedByContent
            ? 'path+content'
            : (matchedByPath ? 'path' : 'content'),
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
    return { success: false, error: `Search failed: ${error.message}` };
  }

  results.sort((left, right) => (left.path > right.path ? 1 : -1));
  return {
    success: true,
    results,
    scanned: searchableFiles.length,
  };
}
