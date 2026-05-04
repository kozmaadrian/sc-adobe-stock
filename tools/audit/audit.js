import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import getStyle from 'https://da.live/nx/utils/styles.js';
import {
  fetchStatusReport,
  fetchVersionTimeline,
  searchContentPaths,
} from './utils/api.js';
import { formatDuration } from './lib/audit-formatters.js';
import {
  buildAuditPayload,
  createLoadingAuditState,
} from './lib/audit-timeline.js';
import { renderProgressRing } from './components/audit-progress-ring.js';
import './components/audit-search-header.js';
import './components/audit-workspace.js';

const EL_NAME = 'content-audit';
const DEFAULT_SITE = 'sc-adobe-stock';
const styles = await getStyle(import.meta.url);

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
      this._searchTerm = typeof value === 'string' ? value : '';
      if (!this._searchTerm.trim()) {
        this.resetSearchResults();
      }
      return;
    }

    if (field === 'org') {
      this._org = typeof value === 'string' ? value.trim() : '';
      if (!this._org) {
        this.resetSearchResults();
      }
    }
  }

  get canSearch() {
    return Boolean(
      this._org?.trim()
      && this._site?.trim()
      && this._searchTerm?.trim()
      && !this._isSearching,
    );
  }

  handleFieldChangeEvent(event) {
    const { field, value } = event?.detail || {};
    if (typeof field !== 'string') return;
    this.handleFieldChange(field, value);
  }

  handleFullTextChange(event) {
    const nextValue = typeof event?.detail?.value === 'boolean'
      ? event.detail.value
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

    let result;
    try {
      result = await searchContentPaths(
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
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed unexpectedly.',
      };
    }

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

  async handleSearchSubmit() {
    const term = this._searchTerm?.trim() || '';
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
      [path]: createLoadingAuditState(),
    };

    const [statusResult, versionResult] = await Promise.all([
      fetchStatusReport(this._org, this._site, path, this._token),
      fetchVersionTimeline(this._org, this._site, path, this._token),
    ]);

    this._auditByPath = {
      ...this._auditByPath,
      [path]: buildAuditPayload(statusResult, versionResult),
    };
  }

  async handleSelectPath(event) {
    const path = event?.detail?.path || '';
    await this.selectResultPath(path);
  }

  renderAlert() {
    if (!this._alert) return '';
    return html`
      <div class="alert alert-${this._alert.type}">
        <div class="alert-content">${this._alert.message}</div>
      </div>
    `;
  }

  renderSearchLoading() {
    if (!this._isSearching) return '';

    return html`
      <div class="audit-empty-layout search-loading" role="status" aria-live="polite" aria-busy="true">
        <div class="empty-card">
          <div class="audit-detail-state">
            <div class="audit-detail-state__figure">${renderProgressRing()}</div>
            <p class="audit-detail-state__message audit-detail-state__message--loading">
              Searching content paths...
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
        in ${formatDuration(this._searchMeta.durationMs)}.
      </p>
    `;
  }

  get selectedAudit() {
    if (!this._expandedPath) return null;
    return this._auditByPath[this._expandedPath] || null;
  }

  renderSearchWorkspace() {
    if (!this._searchMeta) return '';

    if (!this._searchResults.length) {
      return '';
    }

    return html`
      <audit-workspace
        .searchResults=${this._searchResults}
        .selectedPath=${this._expandedPath}
        .selectedAudit=${this.selectedAudit}
        @audit-select-path=${this.handleSelectPath}
      ></audit-workspace>
    `;
  }

  render() {
    return html`
      <div class="audit-shell">
        <header class="audit-header">
          <audit-search-header
            .org=${this._org}
            .site=${this._site}
            .searchTerm=${this._searchTerm}
            .fullTextSearch=${this._fullTextSearch}
            .canSearch=${this.canSearch}
            @audit-field-change=${this.handleFieldChangeEvent}
            @audit-full-text-change=${this.handleFullTextChange}
            @audit-search-submit=${this.handleSearchSubmit}
          ></audit-search-header>
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

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, ContentAudit);
}

/**
 * Initializes the audit component.
 * @param {HTMLElement} el Container element.
 */
export default async function init(el) {
  el.replaceChildren();
  const { context, token } = await DA_SDK;
  const cmp = document.createElement(EL_NAME);
  cmp._context = context;
  cmp._token = token;
  cmp._org = context?.org || context?.owner || '';
  cmp._site = DEFAULT_SITE;
  el.append(cmp);
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
