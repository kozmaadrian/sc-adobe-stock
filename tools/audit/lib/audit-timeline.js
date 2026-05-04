import {
  authorsFromEmails,
  formatAuthorLabel,
  formatEventKind,
  parseTimestamp,
} from './audit-formatters.js';

const VERSION_API_HOST = 'https://admin.da.live';

export function createLoadingAuditState() {
  return {
    loading: true,
    error: '',
    warning: '',
    summary: null,
    timeline: [],
    statusLinks: [],
  };
}

export function classifyVersionEvent(entry = {}) {
  const normalizedLabel = entry.label?.toLowerCase() || '';

  if (normalizedLabel.includes('publish')) {
    return { kind: 'published', title: 'Content published' };
  }

  if (entry.versionId) {
    if (normalizedLabel.includes('preview')) {
      return { kind: 'version', title: 'Version previewed' };
    }
    return { kind: 'version', title: 'New version created' };
  }

  return { kind: 'modified', title: 'Content modified' };
}

/**
 * Maps Status API payload to timeline rows.
 * - preview.sourceLastModified -> source edit in DA.
 * - preview.lastModified -> preview site build time.
 * - live.lastModified -> production site publish time.
 */
export function buildStatusEvents(status) {
  const events = [];
  const preview = status?.preview;
  const live = status?.live;

  if (preview?.sourceLastModified) {
    const timestamp = parseTimestamp(preview.sourceLastModified);
    if (!Number.isNaN(timestamp)) {
      const details = [];
      const author = preview.lastModifiedBy
        ? formatAuthorLabel(preview.lastModifiedBy)
        : '';

      if (preview.sourceLocation) {
        details.push(`Source ${preview.sourceLocation}`);
      }

      events.push({
        kind: 'modified',
        title: 'Source updated (preview)',
        source: 'Status API',
        timestamp,
        author,
        badgeLabel: 'Modified',
        pillVariant: 'modified',
        details,
      });
    }
  }

  if (preview?.lastModified) {
    const timestamp = parseTimestamp(preview.lastModified);
    if (!Number.isNaN(timestamp)) {
      events.push({
        kind: 'version',
        title: 'Preview site updated',
        source: 'Status API',
        timestamp,
        badgeLabel: 'Preview',
        pillVariant: 'preview',
        details: preview.url ? [`Preview URL ${preview.url}`] : [],
      });
    }
  }

  if (live?.lastModified) {
    const timestamp = parseTimestamp(live.lastModified);
    if (!Number.isNaN(timestamp)) {
      events.push({
        kind: 'published',
        title: 'Live site updated',
        source: 'Status API',
        timestamp,
        badgeLabel: 'Live',
        pillVariant: 'published',
        details: live.url ? [`Live URL ${live.url}`] : [],
      });
    }
  }

  return events;
}

/**
 * Version List API entries:
 * - `label` drives action-pill text when present.
 * - `kind` is inferred from label + version metadata.
 */
export function buildVersionEvents(versions) {
  if (!Array.isArray(versions) || !versions.length) return [];
  const seen = new Set();

  return versions.reduce((events, entry) => {
    const timestamp = parseTimestamp(entry?.timestamp);
    if (Number.isNaN(timestamp)) return events;

    const users = Array.isArray(entry?.users)
      ? entry.users.map((user) => user?.email).filter(Boolean)
      : [];

    const key = [
      timestamp,
      entry.versionId || '',
      entry.label || '',
      entry.path || '',
      users.join(','),
    ].join('|');

    if (seen.has(key)) return events;
    seen.add(key);

    const { kind, title } = classifyVersionEvent(entry);
    const details = [];
    if (entry.label) details.push(`Label ${entry.label}`);
    if (entry.versionId) details.push(`Version ID ${entry.versionId}`);

    const labelRaw = entry.label?.trim() || '';
    const labelLow = labelRaw.toLowerCase();
    let pillVariant = kind;
    if (labelLow.includes('preview')) {
      pillVariant = 'preview';
    } else if (labelLow.includes('publish')) {
      pillVariant = 'published';
    }

    const link = entry.url
      ? (entry.url.startsWith('http') ? entry.url : `${VERSION_API_HOST}${entry.url}`)
      : '';

    events.push({
      kind,
      title,
      source: 'Version List API',
      timestamp,
      author: authorsFromEmails(users),
      badgeLabel: labelRaw || formatEventKind(kind),
      pillVariant,
      details,
      link,
    });

    return events;
  }, []);
}

export function buildSummary(events) {
  const summary = {
    total: 0,
    published: 0,
    modified: 0,
    versions: 0,
  };

  events.forEach((event) => {
    summary.total += 1;
    if (event.kind === 'published') summary.published += 1;
    else if (event.kind === 'version') summary.versions += 1;
    else summary.modified += 1;
  });

  return summary;
}

export function buildTimeline(status, versions) {
  const events = [
    ...buildStatusEvents(status),
    ...buildVersionEvents(versions),
  ];

  return events.sort((left, right) => right.timestamp - left.timestamp);
}

export function buildAuditPayload(statusResult, versionResult) {
  const hasStatus = Boolean(statusResult?.success);
  const hasVersions = Boolean(versionResult?.success);

  const statusError = statusResult?.error || 'Unknown error';
  const versionError = versionResult?.error || 'Unknown error';

  if (!hasStatus && !hasVersions) {
    return {
      loading: false,
      error: `Audit failed. Status API: ${statusError}. Version List API: ${versionError}.`,
      warning: '',
      summary: null,
      timeline: [],
      statusLinks: [],
    };
  }

  const status = hasStatus ? statusResult.status : null;
  const versions = hasVersions ? (versionResult.versions || []) : [];
  const timeline = buildTimeline(status, versions);
  const summary = buildSummary(timeline);
  const statusLinks = Object.entries(status?.links || {})
    .map(([name, url]) => ({ name, url }))
    .filter((entry) => entry.url);

  const failedSources = [];
  if (!hasStatus) failedSources.push(`Status API: ${statusError}`);
  if (!hasVersions) failedSources.push(`Version List API: ${versionError}`);

  return {
    loading: false,
    error: '',
    warning: failedSources.length ? `Partial data only. ${failedSources.join(' | ')}` : '',
    summary,
    timeline,
    statusLinks,
  };
}
