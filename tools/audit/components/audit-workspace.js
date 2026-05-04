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

  renderEventCount(eventCount) {
    if (eventCount === null) return '';
    return html`
      <span class="panel-head__timeline-meta">
        ${eventCount} event${eventCount === 1 ? '' : 's'}
      </span>
    `;
  }

  renderSelectedHeader(selectedPath) {
    if (!selectedPath) {
      return html`
        <div class="panel-head__intro">
          <h2 class="panel-head__title">Audit</h2>
          <p class="panel-head__sub">
            Select a path from the list to inspect its timeline.
          </p>
        </div>
      `;
    }

    const eventCount = this.selectedEventCount;
    return html`
      <div class="panel-head__hero-stack">
        <div class="panel-head__intro">
          <div class="panel-head__timeline-row">
            <h2 class="panel-head__title panel-head__title--timeline">Activity timeline</h2>
            ${this.renderEventCount(eventCount)}
          </div>
          <p class="panel-head__path-under">
            <code>${pathForDisplay(selectedPath)}</code>
          </p>
        </div>
      </div>
    `;
  }

  render() {
    const results = Array.isArray(this.searchResults) ? this.searchResults : [];
    if (!results.length) return '';

    const selectedPath = this.selectedPath || '';
    const detailHeadClass = selectedPath
      ? 'panel-head audit-workspace__cell audit-workspace__cell--head-detail panel-head--hero'
      : 'panel-head audit-workspace__cell audit-workspace__cell--head-detail';

    return html`
      <div class="audit-workspace">
        <div class="audit-workspace__grid">
          <div class="panel-head audit-workspace__cell audit-workspace__cell--head-sidebar">
            <h2 class="panel-head__title">Matching paths</h2>
            <p class="panel-head__sub">
              ${results.length} path${results.length === 1 ? '' : 's'} · click one to open
              the audit
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
