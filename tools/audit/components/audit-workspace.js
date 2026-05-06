import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import { pathForDisplay } from '../lib/audit-formatters.js';
import './audit-path-list.js';
import './audit-detail-panel.js';

const EL_NAME = 'audit-workspace';

class AuditWorkspace extends LitElement {
  static properties = {
    searchResults: { type: Array },
    selectedPath: { type: String },
    selectedAudit: { type: Object },
  };

  constructor() {
    super();
    this.searchResults = [];
    this.selectedPath = '';
    this.selectedAudit = null;
  }

  createRenderRoot() {
    return this;
  }

  get selectedEventCount() {
    if (!this.selectedAudit || this.selectedAudit.loading || this.selectedAudit.error) {
      return null;
    }
    const timeline = Array.isArray(this.selectedAudit.timeline)
      ? this.selectedAudit.timeline
      : [];
    return timeline.length;
  }

  handleRefreshTimelineClick() {
    const path = this.selectedPath?.trim() || '';
    if (!path) return;
    this.dispatchEvent(new CustomEvent('audit-refresh-timeline', {
      detail: { path },
      bubbles: true,
      composed: true,
    }));
  }

  renderTimelineTrailing() {
    const path = this.selectedPath?.trim() || '';
    const hasPath = Boolean(path);
    const eventCount = this.selectedEventCount;
    const loading = Boolean(this.selectedAudit?.loading);
    const showMeta = hasPath && eventCount !== null;

    return html`
      <div
        class="panel-head__timeline-trailing"
        ?aria-hidden=${!hasPath}
      >
        ${showMeta ? html`
          <span class="panel-head__timeline-meta">
            ${eventCount} event${eventCount === 1 ? '' : 's'}
          </span>
        ` : html`
          <span
            class="panel-head__timeline-meta panel-head__timeline-meta--reserved"
            aria-hidden="true"
          ></span>
        `}
        <button
          type="button"
          class="icon-tool-trigger timeline-refresh-trigger ${hasPath
        ? ''
        : 'timeline-refresh-trigger--placeholder'}"
          title="Reload activity for this path from the server (version list)"
          aria-label="Refresh activity timeline"
          ?disabled=${!hasPath || loading}
          @click=${this.handleRefreshTimelineClick}
        >
          <svg
            class="icon-tool-trigger__icon timeline-refresh-trigger__icon"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M18.2065 3.89745C17.8013 3.80272 17.3984 4.04784 17.3013 4.45116L16.9208 6.02587C15.5231 3.59399 12.919 2.02148 10 2.02148C6.31544 2.02148 3.12452 4.52148 2.24073 8.10156C2.14112 8.5039 2.38673 8.91015 2.78907 9.00976C3.19044 9.10937 3.59766 8.86328 3.69678 8.46093C4.41504 5.55273 7.00684 3.52148 10 3.52148C12.5168 3.52148 14.735 4.96777 15.809 7.1538L13.7065 6.6455C13.3032 6.55175 12.8989 6.79589 12.8013 7.19921C12.7041 7.60155 12.9517 8.00683 13.354 8.10448L16.5992 8.88866C16.724 8.97728 16.8729 9.03124 17.0308 9.03124C17.0903 9.03124 17.1509 9.0244 17.2109 9.00976C17.2592 8.9978 17.2968 8.96874 17.3401 8.94872C17.4097 8.93017 17.4835 8.92919 17.5459 8.89061C17.7153 8.78709 17.8369 8.6201 17.8838 8.42674L18.7593 4.80272C18.8564 4.40038 18.6089 3.9951 18.2065 3.89745Z"
            />
            <path
              fill="currentColor"
              d="M17.2109 11.0323C16.8139 10.9356 16.4028 11.1788 16.3032 11.5811C15.5849 14.4903 12.9931 16.5215 9.99998 16.5215C7.48295 16.5215 5.26475 15.075 4.19084 12.888L6.29344 13.3965C6.69627 13.4883 7.10155 13.2462 7.19871 12.8428C7.29588 12.4405 7.04832 12.0352 6.64598 11.9376L3.39104 11.1509C3.22002 11.0328 3.00573 10.9796 2.78905 11.0323C2.77385 11.0362 2.76305 11.0469 2.74834 11.0516C2.64513 11.0648 2.54442 11.0958 2.45409 11.1514C2.28466 11.255 2.16307 11.4219 2.1162 11.6153L1.24071 15.2393C1.14354 15.6417 1.3911 16.0469 1.79344 16.1446C1.85301 16.1583 1.91209 16.1651 1.9702 16.1651C2.30858 16.1651 2.61571 15.9346 2.69872 15.5909L3.07915 14.0162C4.47679 16.4483 7.08104 18.0215 9.99999 18.0215C13.6846 18.0215 16.8755 15.5206 17.7593 11.9405C17.8589 11.5382 17.6133 11.1319 17.2109 11.0323Z"
            />
          </svg>
        </button>
      </div>
    `;
  }

  renderSelectedHeader(selectedPath) {
    const path = selectedPath?.trim() || '';
    const hasPath = Boolean(path);

    return html`
      <div class="panel-head__hero-stack">
        <div class="panel-head__intro">
          <div class="panel-head__timeline-row">
            <h2 class="panel-head__title panel-head__title--timeline">
              ${hasPath ? 'Activity timeline' : 'Audit'}
            </h2>
            ${this.renderTimelineTrailing()}
          </div>
          ${hasPath
        ? html`
              <p class="panel-head__path-under">
                <code>${pathForDisplay(path)}</code>
              </p>
            `
        : html`
              <p class="panel-head__path-under panel-head__path-under--hint">
                Select a path from the list to inspect its timeline.
              </p>
            `}
        </div>
      </div>
    `;
  }

  render() {
    const results = Array.isArray(this.searchResults) ? this.searchResults : [];
    if (!results.length) return '';

    const selectedPath = this.selectedPath || '';
    const detailHeadClass =
      'panel-head audit-workspace__cell audit-workspace__cell--head-detail panel-head--hero';

    return html`
      <div class="audit-workspace">
        <div class="audit-workspace__grid">
          <div class="panel-head audit-workspace__cell audit-workspace__cell--head-sidebar">
            <h2 class="panel-head__title">Matching paths</h2>
            <p class="panel-head__sub">
              ${results.length} path${results.length === 1 ? '' : 's'} · matching search and filters
            </p>
            <span class="panel-head__sidebar-aside-label">Modified</span>
          </div>
          <div class=${detailHeadClass}>
            ${this.renderSelectedHeader(selectedPath)}
          </div>
          <section
            class="audit-pane audit-pane--sidebar audit-workspace__cell audit-workspace__cell--body-sidebar"
            aria-label="Matching paths"
          >
            <div class="panel-scroll panel-scroll--sidebar">
              <audit-path-list
                .results=${results}
                .selectedPath=${selectedPath}
              ></audit-path-list>
            </div>
          </section>
          <section
            class="audit-pane audit-pane--detail audit-workspace__cell audit-workspace__cell--body-detail"
            aria-label="Audit for selected path"
          >
            <div class="panel-scroll panel-scroll--detail">
              <audit-detail-panel
                .selectedPath=${selectedPath}
                .audit=${this.selectedAudit}
              ></audit-detail-panel>
            </div>
          </section>
        </div>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, AuditWorkspace);
}
