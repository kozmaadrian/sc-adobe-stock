/**
 * Formatting helpers for the audit tool.
 */

export function pathForDisplay(path) {
  if (!path || typeof path !== 'string') return '';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  const segments = withSlash.split('/').filter(Boolean);
  if (!segments.length) return withSlash;

  const last = segments[segments.length - 1];
  const stem = last.replace(/\.[^./]+$/, '');
  segments[segments.length - 1] = stem || last;
  return `/${segments.join('/')}`;
}

export function parseTimestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  return Number.NaN;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Human-readable time labels for event timestamps.
 * @param {number|string} timestamp
 * @param {Date} [now]
 * @returns {string}
 */
export function formatSmartTime(timestamp, now = new Date()) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const diffMs = now.getTime() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  const eventDay = startOfDay(date);
  const today = startOfDay(now);
  const yesterday = today - dayMs;

  const timeOptions = { hour: 'numeric', minute: '2-digit' };
  const atTime = date.toLocaleTimeString(undefined, timeOptions);

  if (diffMs < 0) {
    const options = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };

    if (date.getFullYear() !== now.getFullYear()) {
      options.year = 'numeric';
    }

    return date.toLocaleString(undefined, options);
  }

  if (diffMs < 60 * minuteMs) {
    const minutes = Math.floor(diffMs / minuteMs);
    return minutes < 1 ? 'just now' : `${minutes} min ago`;
  }

  if (eventDay === yesterday) {
    return `yesterday at ${atTime}`;
  }

  if (eventDay === today) {
    if (diffMs >= hourMs && diffMs < dayMs) {
      const hours = Math.floor(diffMs / hourMs);
      return `${Math.max(1, hours)} h ago`;
    }
    return `today at ${atTime}`;
  }

  const options = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };

  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }

  return date.toLocaleString(undefined, options);
}

export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return '';
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function formatEventKind(kind) {
  if (kind === 'published') return 'Published';
  if (kind === 'previewed') return 'Previewed';
  if (kind === 'versioned') return 'Versioned';
  return 'Modified';
}

export function authorsFromEmails(emails) {
  if (!Array.isArray(emails) || !emails.length) return '';
  const labels = [
    ...new Set(
      emails
        .map((email) => (typeof email === 'string' ? email.trim() : ''))
        .filter(Boolean),
    ),
  ];
  return labels.join(', ');
}

/**
 * @param {{ kind?: string, badgeLabel?: string }} event
 * @returns {string}
 */
export function actionPillLabel(event) {
  if (event?.badgeLabel) return event.badgeLabel;
  return formatEventKind(event?.kind);
}

/**
 * @param {{ kind?: string, pillVariant?: string }} event
 * @returns {string}
 */
export function actionPillVariant(event) {
  return event?.pillVariant || event?.kind || 'modified';
}
