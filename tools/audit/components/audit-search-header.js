import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';

const EL_NAME = 'audit-search-header';

class AuditSearchHeader extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    searchTerm: { type: String },
    fullTextSearch: { type: Boolean },
    canSearch: { type: Boolean },
  };

  constructor() {
    super();
    this.org = '';
    this.site = '';
    this.searchTerm = '';
    this.fullTextSearch = false;
    this.canSearch = false;
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

  render() {
    return html`
      <div class="header-inner">
        <div class="brand-row">
          <div class="title-wrap">
            <h1>Audit Explorer</h1>
            <p class="subtitle">
              Find a document and inspect history and compare versions.
            </p>
          </div>
        </div>
        <form class="audit-search-form" @submit=${this.handleSubmit}>
          <div class="search-bar" role="search">
            <input
              type="text"
              id="org"
              name="org"
              class="field"
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
              class="field"
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
              class="field field--query"
              placeholder="Path query..."
              .value=${this.searchTerm}
              @input=${(event) => this.handleFieldInput('searchTerm', event)}
              required
            />
            <label
              class="switch-control search-bar__toggle"
              for="full-text-toggle"
              title="Toggle full text search"
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
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, AuditSearchHeader);
}
