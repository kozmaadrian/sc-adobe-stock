import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import { pathForDisplay } from '../lib/audit-formatters.js';
import { renderProgressRing } from './audit-progress-ring.js';
import './audit-timeline.js';

const EL_NAME = 'audit-detail-panel';

class AuditDetailPanel extends LitElement {
  static properties = {
    selectedPath: { type: String },
    audit: { type: Object },
  };

  constructor() {
    super();
    this.selectedPath = '';
    this.audit = null;
  }

  createRenderRoot() {
    return this;
  }

  renderMainEmpty() {
    return html`
      <div class="audit-empty-layout audit-empty-layout--detail-top">
        <div class="empty-card">
          <p class="audit-main-empty__title">Choose a path</p>
          <p class="audit-main-empty__hint">
            Pick a path from the left list to load publish, modify, and version history.
          </p>
        </div>
      </div>
    `;
  }

  renderLoading() {
    return html`
      <div
        class="audit-empty-layout audit-empty-layout--detail-top"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="empty-card">
          <div class="audit-detail-state">
            <div class="audit-detail-state__figure">${renderProgressRing()}</div>
            <p class="audit-detail-state__message audit-detail-state__message--loading">
              Loading audit for <code>${pathForDisplay(this.selectedPath)}</code>...
            </p>
          </div>
        </div>
      </div>
    `;
  }

  renderError(message) {
    return html`
      <div class="audit-panel">
        <p class="audit-error">${message}</p>
      </div>
    `;
  }

  renderReady(audit) {
    const warning = audit?.warning || '';
    const timeline = Array.isArray(audit?.timeline) ? audit.timeline : [];
    return html`
      <div class="audit-review">
        ${warning ? html`<p class="audit-warning">${warning}</p>` : ''}
        <audit-timeline .events=${timeline}></audit-timeline>
      </div>
    `;
  }

  render() {
    if (!this.selectedPath) {
      return this.renderMainEmpty();
    }

    if (!this.audit || this.audit.loading) {
      return this.renderLoading();
    }

    if (this.audit.error) {
      return this.renderError(this.audit.error);
    }

    return this.renderReady(this.audit);
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, AuditDetailPanel);
}
