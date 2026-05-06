import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import {
  actionPillLabel,
  actionPillVariant,
  formatEventKind,
  formatSmartTime,
} from '../lib/audit-formatters.js';

const EL_NAME = 'audit-timeline';

function sanitizeVariantClass(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '') || 'modified';
}

class AuditTimeline extends LitElement {
  static properties = {
    events: { type: Array },
  };

  constructor() {
    super();
    this.events = [];
  }

  createRenderRoot() {
    return this;
  }

  renderEmptyState() {
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

  renderEventDetails(details) {
    if (!details.length) return '';
    return html`
      <div class="event-body">
        ${details.map((line) => html`<p class="event-body__line">${line}</p>`)}
      </div>
    `;
  }

  renderAuthor(author) {
    if (!author) return '';
    return html`
      <span class="pill pill--author" title=${author}>${author}</span>
    `;
  }

  renderCompareIcon() {
    return html`
      <svg
        class="timeline-compare-trigger__svg"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M5.75 17H3.25C2.00928 17 1 15.9907 1 14.75V5.25C1 4.00928 2.00928 3 3.25 3H5.75C6.99072 3 8 4.00928 8 5.25V14.75C8 15.9907 6.99072 17 5.75 17ZM3.25 4.5C2.83643 4.5 2.5 4.83643 2.5 5.25V14.75C2.5 15.1636 2.83643 15.5 3.25 15.5H5.75C6.16357 15.5 6.5 15.1636 6.5 14.75V5.25C6.5 4.83643 6.16357 4.5 5.75 4.5H3.25Z"
          fill="currentColor"
        />
        <path
          d="M16.75 17H14.25C13.0093 17 12 15.9907 12 14.75V5.25C12 4.00928 13.0093 3 14.25 3H16.75C17.9907 3 19 4.00928 19 5.25V14.75C19 15.9907 17.9907 17 16.75 17ZM14.25 4.5C13.8364 4.5 13.5 4.83643 13.5 5.25V14.75C13.5 15.1636 13.8364 15.5 14.25 15.5H16.75C17.1636 15.5 17.5 15.1636 17.5 14.75V5.25C17.5 4.83643 17.1636 4.5 16.75 4.5H14.25Z"
          fill="currentColor"
        />
        <path
          d="M10 19C9.58594 19 9.25 18.6641 9.25 18.25V1.75C9.25 1.33594 9.58594 1 10 1C10.4141 1 10.75 1.33594 10.75 1.75V18.25C10.75 18.6641 10.4141 19 10 19Z"
          fill="currentColor"
        />
      </svg>
    `;
  }

  handleCompareClick(clickEvent, timelineEvent) {
    clickEvent.stopPropagation();
    const versionId = timelineEvent?.versionId?.trim() || '';
    if (!versionId) return;
    this.dispatchEvent(new CustomEvent('audit-open-diff', {
      detail: {
        versionId,
        versionLabel: timelineEvent?.versionLabel || '',
        versionUrl: timelineEvent?.versionUrl || '',
      },
      bubbles: true,
      composed: true,
    }));
  }

  renderCompareTrigger(event) {
    if (!event?.versionId) return '';
    return html`
      <button
        type="button"
        class="icon-tool-trigger timeline-compare-trigger"
        title="Compare this version"
        @click=${(clickEvent) => this.handleCompareClick(clickEvent, event)}
      >
        <span class="timeline-compare-trigger__icon-wrap" aria-hidden="true">
          ${this.renderCompareIcon()}
        </span>
        <span class="timeline-compare-trigger__label">Compare</span>
      </button>
    `;
  }

  renderTimelineEvent(event) {
    const heading = event?.title || formatEventKind(event?.kind);
    const isoTimestamp = Number.isFinite(event?.timestamp)
      ? new Date(event.timestamp).toISOString()
      : '';
    const details = Array.isArray(event?.details)
      ? event.details.filter(
        (line) => typeof line === 'string' && line.trim(),
      )
      : [];
    const author = typeof event?.author === 'string' ? event.author : '';
    const variantClass = sanitizeVariantClass(actionPillVariant(event));

    return html`
      <li class="timeline-event timeline-event--${variantClass}" role="listitem">
        <div class="event-card">
          <div class="event-card__main">
            <div class="event-top">
              <strong class="event-top__title event-top__title--${variantClass}">${heading}</strong>
              <time class="event-top__time" datetime=${isoTimestamp}>
                ${formatSmartTime(event?.timestamp)}${author ? html`, ${author}` : ''}
              </time>
            </div>
            ${this.renderEventDetails(details)}
          </div>
          <aside class="event-card__aside">
            <div class="event-aside__top">
              ${this.renderCompareTrigger(event)}
            </div>
          </aside>
        </div>
      </li>
    `;
  }

  render() {
    const timeline = Array.isArray(this.events) ? this.events : [];
    if (!timeline.length) {
      return this.renderEmptyState();
    }

    return html`
      <div class="timeline">
        <ul class="timeline-list" role="list">
          ${timeline.map((event) => this.renderTimelineEvent(event))}
        </ul>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, AuditTimeline);
}
