import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import getStyle from 'https://da.live/nx/utils/styles.js';
import {
  fetchStatusReport,
  fetchVersionTimeline,
  searchContentPaths,
} from './utils/api.js';

const EL_NAME = 'content-audit';
const DEFAULT_SITE = 'sc-adobe-stock';
const styles = await getStyle(import.meta.url);

/**
 * Search-first audit tool.
 * Search for content paths first, then pick a result in the sidebar to view its audit.
 */
class ContentAudit extends LitElement {
  static properties = {
    _context: { state: true },
    _token: { state: true },
    _org: { state: true },
    _site: { state: true },
    _searchTerm: { state: true },
    _searchResults: { state: true },
    _searchMeta: { state: true },
    _expandedPath: { state: true },
    _auditByPath: { state: true },
    _alert: { state: true },
    _isSearching: { state: true },
    _fullTextSearch: { state: true },
  };

  constructor() {
    super();
    this._org = '';
    this._site = DEFAULT_SITE;
    this._searchTerm = '';
    this._searchResults = [];
    this._searchMeta = null;
    this._expandedPath = '';
    this._auditByPath = {};
    this._alert = null;
    this._isSearching = false;
    this._fullTextSearch = false;
    this._activeSearchRequest = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  resetSearchResults(options = {}) {
    const { clearAlert = true } = options;
    this._activeSearchRequest += 1;
    this._isSearching = false;
    this._searchResults = [];
    this._searchMeta = null;
    this._expandedPath = '';
    this._auditByPath = {};
    if (clearAlert) this._alert = null;
  }

  handleFieldChange(field, value) {
    if (field === 'site') {
      this._site = typeof value === 'string' ? value.trim() : '';
      if (!this._site) {
        this.resetSearchResults();
      }
      return;
    }

    if (field === 'searchTerm') {
      this._searchTerm = value;
      if (!this._searchTerm.trim()) {
        this.resetSearchResults();
      }
      return;
    }

    this[`_${field}`] = value.trim();
    if (field === 'org') {
      if (!this._org) {
        this.resetSearchResults();
      }
    }
  }

  get canSearch() {
    return this._org?.trim() && this._site?.trim() && this._searchTerm?.trim() && !this._isSearching;
  }

  /**
   * Full path for UI (leading slash), with the file extension removed from the last segment.
   */
  pathForDisplay(path) {
    if (!path || typeof path !== 'string') return '';
    const withSlash = path.startsWith('/') ? path : `/${path}`;
    const segments = withSlash.split('/').filter(Boolean);
    if (!segments.length) return withSlash;
    const last = segments[segments.length - 1];
    const stem = last.replace(/\.[^./]+$/, '');
    segments[segments.length - 1] = stem || last;
    return `/${segments.join('/')}`;
  }

  /** When the audit is loaded, number of timeline events; otherwise `null` (loading / error). */
  auditTimelineEventCount(path) {
    const audit = this._auditByPath[path];
    if (!audit || audit.loading || audit.error) return null;
    return (audit.timeline ?? []).length;
  }

  parseTimestamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? Number.NaN : parsed;
    }
    return Number.NaN;
  }

  /**
   * Human-readable time: "N min ago"; same day "N h ago" (1–23 h) or "today at …" (61–119 min);
   * calendar "yesterday at …"; older dates as "Mon D, h:mm" (with year if not current year).
   */
  formatSmartTime(timestamp) {
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return 'Unknown';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    const startOf = (d) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const eventDay = startOf(date);
    const today = startOf(now);
    const yesterday = today - dayMs;

    const timeOpts = { hour: 'numeric', minute: '2-digit' };
    const atTime = date.toLocaleTimeString(undefined, timeOpts);

    if (diffMs < 0) {
      const opts = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      };
      if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
      return date.toLocaleString(undefined, opts);
    }

    if (diffMs < 60 * minuteMs) {
      const mins = Math.floor(diffMs / minuteMs);
      return mins < 1 ? 'just now' : `${mins} min ago`;
    }

    if (eventDay === yesterday) {
      return `yesterday at ${atTime}`;
    }

    if (eventDay === today) {
      if (diffMs >= hourMs && diffMs < dayMs) {
        const h = Math.floor(diffMs / hourMs);
        return `${Math.max(1, h)} h ago`;
      }
      return `today at ${atTime}`;
    }

    const opts = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    if (date.getFullYear() !== now.getFullYear()) {
      opts.year = 'numeric';
    }
    return date.toLocaleString(undefined, opts);
  }

  formatDuration(durationMs) {
    if (!Number.isFinite(durationMs)) return '';
    if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
    return `${(durationMs / 1000).toFixed(2)}s`;
  }

  formatEventKind(kind) {
    if (kind === 'published') return 'Published';
    if (kind === 'version') return 'Version';
    return 'Modified';
  }

  /** Author / actor string exactly as returned by the APIs (no casing or spelling changes). */
  formatAuthorLabel(value) {
    if (!value || typeof value !== 'string') return '';
    return value.trim();
  }

  authorsFromEmails(emails) {
    if (!Array.isArray(emails) || !emails.length) return '';
    const labels = [...new Set(emails.map((e) => (typeof e === 'string' ? e.trim() : '')).filter(Boolean))];
    return labels.join(', ');
  }

  /**
   * Action pill text. Uses API version `label` when set; otherwise short kind name.
   * @param {{ kind: string, badgeLabel?: string }} event
   */
  actionPillLabel(event) {
    if (event.badgeLabel) return event.badgeLabel;
    return this.formatEventKind(event.kind);
  }

  /**
   * CSS variant for the action pill (preview vs live vs version log, etc.).
   * @param {{ kind: string, pillVariant?: string }} event
   */
  actionPillVariant(event) {
    return event.pillVariant || event.kind;
  }

  classifyVersionEvent(entry) {
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
   * Maps Status API payload to timeline rows (distinct from Version List log).
   * - preview.sourceLastModified → source edit in DA (author pill); action pill **Modified**.
   * - preview.lastModified → preview site (.page) build time; pill **Preview** (`kind: version`).
   * - live.lastModified → production (.live); pill **Live** (`kind: published`).
   */
  buildStatusEvents(status) {
    const events = [];
    const preview = status?.preview;
    const live = status?.live;

    if (preview?.sourceLastModified) {
      const timestamp = this.parseTimestamp(preview.sourceLastModified);
      if (!Number.isNaN(timestamp)) {
        const details = [];
        const author = preview.lastModifiedBy
          ? this.formatAuthorLabel(preview.lastModifiedBy)
          : '';
        if (preview.sourceLocation) details.push(`Source ${preview.sourceLocation}`);

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

    /* Preview site (.page) reflects source — distinct from version-log “Previewed”. */
    if (preview?.lastModified) {
      const timestamp = this.parseTimestamp(preview.lastModified);
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
      const timestamp = this.parseTimestamp(live.lastModified);
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
   * Version List API entries: `label` drives the action pill (e.g. “Previewed”, “Test”) when present;
   * classification sets `kind`. Labels containing “preview” / “publish” tint the pill.
   */
  buildVersionEvents(versions) {
    const seen = new Set();

    return versions.reduce((events, entry) => {
      const timestamp = this.parseTimestamp(entry.timestamp);
      if (Number.isNaN(timestamp)) return events;

      const users = Array.isArray(entry.users)
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

      const { kind, title } = this.classifyVersionEvent(entry);
      const details = [];
      if (entry.label) details.push(`Label ${entry.label}`);
      if (entry.versionId) details.push(`Version ID ${entry.versionId}`);
      const author = this.authorsFromEmails(users);

      const labelRaw = entry.label?.trim() || '';
      const labelLow = labelRaw.toLowerCase();
      let pillVariant = kind;
      if (labelLow.includes('preview')) pillVariant = 'preview';
      else if (labelLow.includes('publish')) pillVariant = 'published';

      const badgeLabel = labelRaw || this.formatEventKind(kind);

      const link = entry.url
        ? (entry.url.startsWith('http') ? entry.url : `https://admin.da.live${entry.url}`)
        : '';

      events.push({
        kind,
        title,
        source: 'Version List API',
        timestamp,
        author,
        badgeLabel,
        pillVariant,
        details,
        link,
      });
      return events;
    }, []);
  }

  buildSummary(events) {
    return events.reduce((summary, event) => {
      const nextSummary = { ...summary, total: summary.total + 1 };

      if (event.kind === 'published') nextSummary.published += 1;
      else if (event.kind === 'version') nextSummary.versions += 1;
      else nextSummary.modified += 1;

      return nextSummary;
    }, {
      total: 0,
      published: 0,
      modified: 0,
      versions: 0,
    });
  }

  buildTimeline(status, versions) {
    const events = [
      ...this.buildStatusEvents(status),
      ...this.buildVersionEvents(versions),
    ];

    return events.sort((left, right) => right.timestamp - left.timestamp);
  }

  buildAuditPayload(statusResult, versionResult) {
    if (!statusResult.success && !versionResult.success) {
      return {
        loading: false,
        error: `Audit failed. Status API: ${statusResult.error}. Version List API: ${versionResult.error}.`,
        warning: '',
        summary: null,
        timeline: [],
        statusLinks: [],
      };
    }

    const status = statusResult.success ? statusResult.status : null;
    const versions = versionResult.success ? versionResult.versions : [];
    const timeline = this.buildTimeline(status, versions);
    const summary = this.buildSummary(timeline);
    const statusLinks = Object.entries(status?.links || {})
      .map(([name, url]) => ({ name, url }))
      .filter((entry) => entry.url);

    const failedSources = [];
    if (!statusResult.success) failedSources.push(`Status API: ${statusResult.error}`);
    if (!versionResult.success) failedSources.push(`Version List API: ${versionResult.error}`);

    return {
      loading: false,
      error: '',
      warning: failedSources.length ? `Partial data only. ${failedSources.join(' | ')}` : '',
      summary,
      timeline,
      statusLinks,
    };
  }

  toggleFullTextSearch(event) {
    const nextValue = typeof event?.target?.checked === 'boolean'
      ? event.target.checked
      : !this._fullTextSearch;
    if (nextValue === this._fullTextSearch) return;
    this._fullTextSearch = nextValue;
  }

  async executeSearch(searchTerm) {
    if (!this._org?.trim() || !this._site?.trim() || !searchTerm?.trim()) return;

    const requestId = ++this._activeSearchRequest;
    const start = performance.now();

    this._isSearching = true;
    this._alert = null;
    this._searchResults = [];
    this._searchMeta = null;
    this._expandedPath = '';
    this._auditByPath = {};

    const result = await searchContentPaths(
      this._org,
      this._site,
      searchTerm,
      this._token,
      {
        fullTextSearch: this._fullTextSearch,
        maxResults: 150,
        maxFiles: 1000,
        concurrency: 8,
      },
    );

    if (requestId !== this._activeSearchRequest) return;
    this._isSearching = false;

    if (!result.success) {
      this._alert = { type: 'error', message: result.error };
      return;
    }

    const durationMs = performance.now() - start;
    this._searchResults = result.results;
    this._searchMeta = {
      matches: result.results.length,
      scanned: result.scanned,
      durationMs,
    };
    this._alert = null;
  }

  async handleSearch(event) {
    event.preventDefault();
    const term = this._searchTerm.trim();
    if (!term || !this._org?.trim() || !this._site?.trim()) return;
    await this.executeSearch(term);
  }

  async selectResultPath(path) {
    if (!path) return;

    if (this._expandedPath === path) {
      this._expandedPath = '';
      return;
    }

    this._expandedPath = path;
    const existing = this._auditByPath[path];
    if (existing && !existing.loading) return;

    this._auditByPath = {
      ...this._auditByPath,
      [path]: {
        loading: true,
        error: '',
        warning: '',
        summary: null,
        timeline: [],
        statusLinks: [],
      },
    };

    const [statusResult, versionResult] = await Promise.all([
      fetchStatusReport(this._org, this._site, path, this._token),
      fetchVersionTimeline(this._org, this._site, path, this._token),
    ]);

    this._auditByPath = {
      ...this._auditByPath,
      [path]: this.buildAuditPayload(statusResult, versionResult),
    };
  }

  renderAlert() {
    if (!this._alert) return '';
    return html`
      <div class="alert alert-${this._alert.type}">
        <div class="alert-content">${this._alert.message}</div>
      </div>
    `;
  }

  /** Spectrum-style indeterminate ring (CSS-only; not the Spectrum package). */
  renderProgressCircle() {
    return html`
      <div
        class="spectrum-progress spectrum-progress--sizeM spectrum-progress--indeterminate"
        aria-hidden="true"
      >
        <svg class="spectrum-progress__svg" viewBox="0 0 32 32" focusable="false">
          <circle class="spectrum-progress__track" cx="16" cy="16" r="12.5" fill="none" />
          <g transform="translate(16 16)">
            <g class="spectrum-progress__fills">
              <circle class="spectrum-progress__fill" cx="0" cy="0" r="12.5" fill="none" />
            </g>
          </g>
        </svg>
      </div>
    `;
  }

  renderSearchLoading() {
    if (!this._isSearching) return '';

    return html`
      <div class="audit-empty-layout search-loading" role="status" aria-live="polite" aria-busy="true">
        <div class="empty-card">
          <div class="audit-detail-state">
            <div class="audit-detail-state__figure">${this.renderProgressCircle()}</div>
            <p class="audit-detail-state__message audit-detail-state__message--loading">
              Searching content paths…
            </p>
          </div>
        </div>
      </div>
    `;
  }

  renderSearchMeta() {
    if (!this._searchMeta) return '';
    if (this._searchMeta.matches > 0) return '';

    return html`
      <p class="search-meta search-meta--center">
        Found ${this._searchMeta.matches} of ${this._searchMeta.scanned} scanned files
        in ${this.formatDuration(this._searchMeta.durationMs)}.
      </p>
    `;
  }

  renderAuditEventsTimeline(timeline) {
    const full = timeline ?? [];
    if (!full.length) {
      return html`
        <div class="audit-empty-layout">
          <div class="empty-card">
            <div class="audit-detail-state">
              <div class="audit-detail-state__figure" aria-hidden="true"></div>
              <p class="audit-detail-state__message empty-state">
                No publish, modify, or version events were returned for this path.
              </p>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="timeline">
        <ul class="timeline-list" role="list">
          ${full.map((event) => {
      const heading = event.title || this.formatEventKind(event.kind);
      const iso = Number.isFinite(event.timestamp)
        ? new Date(event.timestamp).toISOString()
        : null;
      return html`
              <li class="timeline-event" role="listitem">
                <div class="event-card">
                  <div class="event-top">
                    <strong class="event-top__title">${heading}</strong>
                    <time class="event-top__time" datetime=${iso ?? false}>${this.formatSmartTime(event.timestamp)}</time>
                  </div>
                  ${event.details?.length ? html`
                    <div class="event-body">
                      ${event.details.map((line) => html`<p class="event-body__line">${line}</p>`)}
                    </div>
                  ` : ''}
                  <div class="event-foot">
                    ${event.author
          ? html`<span class="pill pill--author" title=${event.author}>${event.author}</span>`
          : ''}
                    <span class="pill pill--${this.actionPillVariant(event)}">${this.actionPillLabel(event)}</span>
                    ${event.link
          ? html`<a class="event-link" href="${event.link}" target="_blank" rel="noopener">Open link</a>`
          : ''}
                  </div>
                </div>
              </li>
            `;
    })}
        </ul>
      </div>
    `;
  }

  renderAuditPanel(path) {
    const audit = this._auditByPath[path];
    if (!audit || audit.loading) {
      return html`
        <div class="audit-empty-layout" role="status" aria-live="polite" aria-busy="true">
          <div class="empty-card">
            <div class="audit-detail-state">
              <div class="audit-detail-state__figure">${this.renderProgressCircle()}</div>
              <p class="audit-detail-state__message audit-detail-state__message--loading">
                Loading audit for <code>${this.pathForDisplay(path)}</code>…
              </p>
            </div>
          </div>
        </div>
      `;
    }

    if (audit.error) {
      return html`
        <div class="audit-panel">
          <p class="audit-error">${audit.error}</p>
        </div>
      `;
    }

    const timeline = audit.timeline ?? [];

    return html`
      <div class="audit-review">
        ${audit.warning ? html`<p class="audit-warning">${audit.warning}</p>` : ''}
        ${this.renderAuditEventsTimeline(timeline)}
      </div>
    `;
  }

  renderAuditMainEmpty() {
    return html`
      <div class="audit-empty-layout">
        <div class="empty-card">
          <p class="audit-main-empty__title">Choose a path</p>
          <p class="audit-main-empty__hint">
            Pick a path from the left list to load publish, modify, and version history.
          </p>
        </div>
      </div>
    `;
  }

  renderSearchWorkspace() {
    if (!this._searchMeta) return '';

    if (!this._searchResults.length) {
      return '';
    }

    const selected = this._expandedPath;
    const eventCount = selected ? this.auditTimelineEventCount(selected) : null;

    return html`
      <div class="audit-workspace">
        <div class="audit-workspace__grid">
          <div class="panel-head audit-workspace__cell audit-workspace__cell--head-sidebar">
            <h2 class="panel-head__title">Matching paths</h2>
            <p class="panel-head__sub">
              ${this._searchResults.length} path${this._searchResults.length === 1 ? '' : 's'} · click one to open the audit
            </p>
            <span class="panel-head__sidebar-aside-label">Modified</span>
          </div>
          <div
            class="panel-head audit-workspace__cell audit-workspace__cell--head-detail${selected ? ' panel-head--hero' : ''}"
          >
            ${selected
      ? html`
              <div class="panel-head__hero-stack">
                <div class="panel-head__intro">
                  <div class="panel-head__timeline-row">
                    <h2 class="panel-head__title panel-head__title--timeline">Activity timeline</h2>
                    ${eventCount !== null
      ? html`<span class="panel-head__timeline-meta">${eventCount} event${eventCount === 1 ? '' : 's'}</span>`
      : ''}
                  </div>
                  <p class="panel-head__path-under">
                    <code>${this.pathForDisplay(selected)}</code>
                  </p>
                </div>
              </div>
            `
      : html`
              <div class="panel-head__intro">
                <h2 class="panel-head__title">Audit</h2>
                <p class="panel-head__sub">
                  Select a path from the list to inspect its timeline.
                </p>
              </div>
            `}
          </div>
          <section
            class="audit-pane audit-pane--sidebar audit-workspace__cell audit-workspace__cell--body-sidebar"
            aria-label="Matching paths"
          >
            <div class="panel-scroll panel-scroll--sidebar">
              <ul class="audit-sidebar-list" role="list">
                ${this._searchResults.map((result) => {
      const isSelected = selected === result.path;
      return html`
                  <li class="audit-sidebar-item" role="listitem">
                    <button
                      type="button"
                      class="sidebar-result result-row${isSelected ? ' is-selected' : ''}"
                      @click=${() => this.selectResultPath(result.path)}
                      aria-pressed=${isSelected}
                      title=${result.path}
                    >
                      <div class="result-row__primary">
                        <div class="sidebar-result__path">
                          <code>${this.pathForDisplay(result.path)}</code>
                        </div>
                      </div>
                      <div class="result-row__aside">
                        <div class="result-row__time">${this.formatSmartTime(result.lastModified)}</div>
                      </div>
                    </button>
                  </li>
                `;
    })}
              </ul>
            </div>
          </section>
          <section
            class="audit-pane audit-pane--detail audit-workspace__cell audit-workspace__cell--body-detail"
            aria-label="Audit for selected path"
          >
            <div class="panel-scroll panel-scroll--detail">
              ${selected ? this.renderAuditPanel(selected) : this.renderAuditMainEmpty()}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="audit-shell">
        <header class="audit-header">
          <div class="header-inner">
            <div class="brand-row">
              <div class="title-wrap">
                <h1>Audit Explorer</h1>
                <p class="subtitle">
                  Find a document and inspect history and compare versions.
                </p>
              </div>
            </div>
            <form class="audit-search-form" @submit=${this.handleSearch}>
              <div class="search-bar" role="search">
                <input
                  type="text"
                  id="org"
                  name="org"
                  class="field"
                  placeholder="Organization"
                  aria-label="Organization"
                  title="Organization owning the content"
                  .value=${this._org}
                  @input=${(e) => this.handleFieldChange('org', e.target.value)}
                  required
                />
                <input
                  type="text"
                  id="site"
                  name="site"
                  class="field"
                  placeholder="Site"
                  aria-label="Site"
                  title="Site repository name"
                  .value=${this._site}
                  @input=${(e) => this.handleFieldChange('site', e.target.value)}
                  required
                />
                <input
                  type="text"
                  id="search-term"
                  name="searchTerm"
                  class="field field--query"
                  placeholder="Path query…"
                  .value=${this._searchTerm}
                  @input=${(e) => this.handleFieldChange('searchTerm', e.target.value)}
                  required
                />
                <label class="switch-control search-bar__toggle" for="full-text-toggle" title="Toggle full text search">
                  <input
                    type="checkbox"
                    id="full-text-toggle"
                    name="fullTextSearch"
                    ?checked=${this._fullTextSearch}
                    @change=${this.toggleFullTextSearch}
                  />
                  <span class="switch-slider" aria-hidden="true"></span>
                  <span class="switch-label">Full text</span>
                </label>
                <button
                  type="submit"
                  class="btn btn-primary search-submit"
                  ?disabled=${!this.canSearch}
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </header>
        <main class="audit-main-area">
          ${this.renderAlert()}
          ${this.renderSearchLoading()}
          ${this.renderSearchMeta()}
          ${this.renderSearchWorkspace()}
        </main>
      </div>
    `;
  }
}

customElements.define(EL_NAME, ContentAudit);

/**
 * Initializes the audit component.
 * @param {HTMLElement} el Container element.
 */
export default async function init(el) {
  el.replaceChildren();
  const { context, token } = await DA_SDK;

  let cmp = el.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    cmp._context = context;
    cmp._token = token;
    cmp._org = context?.org || context?.owner || '';
    cmp._site = DEFAULT_SITE;
    el.append(cmp);
  }
}

// Auto-initialize when script loads.
(async () => {
  try {
    const main = document.querySelector('main');
    if (main) {
      await init(main);
    }
  } catch (error) {
    console.error('Failed to initialize audit app:', error);
  }
})();
