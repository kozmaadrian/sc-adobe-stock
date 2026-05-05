import {
  authorsFromEmails,
  formatEventKind,
  parseTimestamp,
} from './audit-formatters.js';

export function createLoadingAuditState() {
  return {
    loading: true,
    error: '',
    warning: '',
    timeline: [],
    versions: [],
  };
}

export function classifyVersionEvent(entry = {}) {
  const normalizedLabel = entry.label?.toLowerCase() || '';

  if (normalizedLabel.includes('publish')) {
    return {
      kind: 'published',
      title: 'Published',
      pillVariant: 'published',
    };
  }

  if (normalizedLabel.includes('preview')) {
    return {
      kind: 'previewed',
      title: 'Previewed',
      pillVariant: 'preview',
    };
  }

  if (entry.versionId) {
    return {
      kind: 'versioned',
      title: 'Versioned',
      pillVariant: 'version',
    };
  }

  return {
    kind: 'modified',
    title: 'Modified',
    pillVariant: 'modified',
  };
}

/**
 * Version List API entries:
 * - Status is inferred from log label + version metadata.
 * - Modified rows have no version ID.
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

    const { kind, title, pillVariant } = classifyVersionEvent(entry);
    const details = [];

    const labelRaw = entry.label?.trim() || '';
    const versionId = entry.versionId?.trim() || '';
    const versionUrl = entry.url?.trim() || '';

    if (kind !== 'modified') {
      details.push(`Version label: ${labelRaw || 'N/A'}`);
      details.push(`Version ID: ${versionId || 'N/A'}`);
    }

    events.push({
      kind,
      title,
      source: 'Version List API',
      timestamp,
      author: authorsFromEmails(users),
      badgeLabel: formatEventKind(kind),
      pillVariant,
      versionId,
      versionLabel: labelRaw,
      versionUrl,
      details,
    });

    return events;
  }, []);
}

export function buildTimeline(versions) {
  const events = buildVersionEvents(versions);

  return events.sort((left, right) => right.timestamp - left.timestamp);
}

export function buildAuditPayload(versionResult) {
  const hasVersions = Boolean(versionResult?.success);

  const versionError = versionResult?.error || 'Unknown error';

  if (!hasVersions) {
    return {
      loading: false,
      error: `Audit failed. Version List API: ${versionError}.`,
      warning: '',
      timeline: [],
      versions: [],
    };
  }

  const versions = hasVersions ? (versionResult.versions || []) : [];
  const timeline = buildTimeline(versions);

  return {
    loading: false,
    error: '',
    warning: '',
    timeline,
    versions,
  };
}
