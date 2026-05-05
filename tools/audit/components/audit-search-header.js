import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';

const EL_NAME = 'audit-search-header';

class AuditSearchHeader extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    searchTerm: { type: String },
    fullTextSearch: { type: Boolean },
    logFrom: { type: String },
    logTo: { type: String },
    logFilterPreview: { type: Boolean },
    logFilterLive: { type: Boolean },
    canSearch: { type: Boolean },
    _filtersOpen: { state: true },
  };

  constructor() {
    super();
    this.org = '';
    this.site = '';
    this.searchTerm = '';
    this.fullTextSearch = false;
    this.logFrom = '';
    this.logTo = '';
    this.logFilterPreview = false;
    this.logFilterLive = false;
    this.canSearch = false;
    this._filtersOpen = false;
  }

  createRenderRoot() {
    return this;
  }

  dispatchAuditEvent(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  handleSubmit(event) {
    event.preventDefault();
    this.dispatchAuditEvent('audit-search-submit');
  }

  handleFieldInput(field, event) {
    this.dispatchAuditEvent('audit-field-change', {
      field,
      value: event.target.value,
    });
  }

  handleFullTextChange(event) {
    this.dispatchAuditEvent('audit-full-text-change', {
      value: Boolean(event?.target?.checked),
    });
  }

  handleLogPreviewChange(event) {
    this.dispatchAuditEvent('audit-field-change', {
      field: 'logFilterPreview',
      value: Boolean(event?.target?.checked),
    });
  }

  handleLogLiveChange(event) {
    this.dispatchAuditEvent('audit-field-change', {
      field: 'logFilterLive',
      value: Boolean(event?.target?.checked),
    });
  }

  toggleFiltersPanel() {
    this._filtersOpen = !this._filtersOpen;
  }

  renderFilterIcon() {
    return html`
      <svg
        class="icon-tool-trigger__icon"
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M8.99901 18.7285C8.63963 18.7285 8.28221 18.6304 7.9619 18.4356C7.35936 18.0698 6.99999 17.4307 6.99999 16.7261V10.4902C6.99999 10.3042 6.93163 10.1265 6.80761 9.98878L2.62792 5.34521C2.08983 4.75488 1.95409 3.92871 2.27929 3.19287C2.60351 2.45703 3.30468 2 4.10937 2H15.8906C16.6953 2 17.3965 2.45703 17.7207 3.19287C18.0459 3.92871 17.9102 4.75488 17.3682 5.34863L13.1924 9.98877C13.0684 10.1265 13 10.3042 13 10.4902V15.5356C13 16.3794 12.5352 17.1445 11.7871 17.5327L9.92188 18.501C9.62989 18.6528 9.31346 18.7285 8.99901 18.7285ZM4.10937 3.5C3.81445 3.5 3.6914 3.7085 3.65136 3.79834C3.61132 3.88818 3.54101 4.12012 3.73925 4.33789L7.92284 8.98486C8.29491 9.39843 8.49999 9.9331 8.49999 10.4902V16.7261C8.49999 16.98 8.66796 17.1094 8.74022 17.1533C8.81249 17.1978 9.00584 17.2856 9.23045 17.1699L11.0957 16.2012C11.3457 16.0718 11.5 15.8169 11.5 15.5356V10.4902C11.5 9.9331 11.7051 9.39843 12.0771 8.98486L16.2568 4.34131C16.459 4.12012 16.3887 3.88819 16.3486 3.79834C16.3086 3.70849 16.1855 3.5 15.8906 3.5H4.10937Z"
        />
      </svg>
    `;
  }

  render() {
    return html`
      <div class="header-inner">
        <div class="brand-row">
          <div class="title-wrap">
            <h1>Audit Explorer (Experimental)</h1>
            <p class="subtitle">
              Find a document and inspect history and compare versions.
            </p>
          </div>
        </div>
        <form class="audit-search-form" @submit=${this.handleSubmit}>
          <div
            class="search-bar search-bar--full"
            role="search"
            aria-label="Repository and path search"
          >
            <input
              type="text"
              id="org"
              name="org"
              class="field search-bar__org"
              placeholder="Organization"
              aria-label="Organization"
              title="Organization owning the content"
              .value=${this.org}
              @input=${(event) => this.handleFieldInput('org', event)}
              required
            />
            <input
              type="text"
              id="site"
              name="site"
              class="field search-bar__site"
              placeholder="Site"
              aria-label="Site"
              title="Site repository name"
              .value=${this.site}
              @input=${(event) => this.handleFieldInput('site', event)}
              required
            />
            <input
              type="text"
              id="search-term"
              name="searchTerm"
              class="field field--query search-bar__query"
              placeholder="Path or full text query..."
              aria-label="Search query"
              .value=${this.searchTerm}
              @input=${(event) => this.handleFieldInput('searchTerm', event)}
              required
            />
            <button
              type="submit"
              class="btn btn-primary search-submit search-bar__submit"
              ?disabled=${!this.canSearch}
            >
              Search
            </button>
            <button
              type="button"
              class="icon-tool-trigger search-filters-trigger"
              aria-expanded=${this._filtersOpen ? 'true' : 'false'}
              aria-controls="audit-search-filters"
              title="Show or hide search filters (full text, log preview/publish, date range)"
              @click=${this.toggleFiltersPanel}
            >
              ${this.renderFilterIcon()}
              <span class="visually-hidden">Filters</span>
            </button>
          </div>

          <div
            id="audit-search-filters"
            class="search-filters-panel"
            ?hidden=${!this._filtersOpen}
          >
            <div class="search-filters-panel__inner">
              <label
                class="switch-control search-filters-panel__item"
                for="full-text-toggle"
              >
                <input
                  type="checkbox"
                  id="full-text-toggle"
                  name="fullTextSearch"
                  ?checked=${this.fullTextSearch}
                  @change=${this.handleFullTextChange}
                />
                <span class="switch-slider" aria-hidden="true"></span>
                <span class="switch-label">Full text</span>
              </label>
              <div
                class="search-filters-panel__group search-filters-panel__group--sep"
                role="group"
                aria-label="Previewed and published in log"
              >
                <label
                  class="switch-control search-filters-panel__item"
                  for="log-filter-preview"
                >
                  <input
                    type="checkbox"
                    id="log-filter-preview"
                    name="logFilterPreview"
                    ?checked=${this.logFilterPreview}
                    @change=${this.handleLogPreviewChange}
                  />
                  <span class="switch-slider" aria-hidden="true"></span>
                  <span class="switch-label">Previewed</span>
                </label>
                <label
                  class="switch-control search-filters-panel__item"
                  for="log-filter-live"
                >
                  <input
                    type="checkbox"
                    id="log-filter-live"
                    name="logFilterLive"
                    ?checked=${this.logFilterLive}
                    @change=${this.handleLogLiveChange}
                  />
                  <span class="switch-slider" aria-hidden="true"></span>
                  <span class="switch-label">Published</span>
                </label>
              </div>
              <div
                class="search-filters-panel__group search-filters-panel__group--sep search-filters-panel__group--dates"
                role="group"
                aria-label="Log time range"
              >
                <label class="search-filters-panel__datetime" for="log-from">
                  <span class="field-label field-label--inline">From</span>
                  <input
                    type="datetime-local"
                    id="log-from"
                    name="logFrom"
                    class="field field--datetime field--datetime-compact"
                    aria-label="Log from"
                    .value=${this.logFrom}
                    @input=${(event) => this.handleFieldInput('logFrom', event)}
                  />
                </label>
                <label class="search-filters-panel__datetime" for="log-to">
                  <span class="field-label field-label--inline">To</span>
                  <input
                    type="datetime-local"
                    id="log-to"
                    name="logTo"
                    class="field field--datetime field--datetime-compact"
                    aria-label="Log to"
                    .value=${this.logTo}
                    @input=${(event) => this.handleFieldInput('logTo', event)}
                  />
                </label>
              </div>
            </div>
          </div>
        </form>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, AuditSearchHeader);
}
