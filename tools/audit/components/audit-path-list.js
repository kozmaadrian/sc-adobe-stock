import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import { formatSmartTime, pathForDisplay } from '../lib/audit-formatters.js';

const EL_NAME = 'audit-path-list';

class AuditPathList extends LitElement {
  static properties = {
    results: { type: Array },
    selectedPath: { type: String },
  };

  constructor() {
    super();
    this.results = [];
    this.selectedPath = '';
  }

  createRenderRoot() {
    return this;
  }

  selectPath(path) {
    this.dispatchEvent(new CustomEvent('audit-select-path', {
      detail: { path },
      bubbles: true,
      composed: true,
    }));
  }

  renderResult(result) {
    const resultPath = result?.path || '';
    const isSelected = resultPath === this.selectedPath;

    return html`
      <li class="audit-sidebar-item" role="listitem">
        <button
          type="button"
          class="sidebar-result result-row${isSelected ? ' is-selected' : ''}"
          @click=${() => this.selectPath(resultPath)}
          aria-pressed=${isSelected}
          title=${resultPath}
        >
          <div class="result-row__primary">
            <div class="sidebar-result__path">
              <code>${pathForDisplay(resultPath)}</code>
            </div>
          </div>
          <div class="result-row__aside">
            <div class="result-row__time">${formatSmartTime(result?.lastModified)}</div>
          </div>
        </button>
      </li>
    `;
  }

  render() {
    const safeResults = Array.isArray(this.results)
      ? this.results.filter(
        (result) => typeof result?.path === 'string' && result.path,
      )
      : [];
    return html`
      <ul class="audit-sidebar-list" role="list">
        ${safeResults.map((result) => this.renderResult(result))}
      </ul>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, AuditPathList);
}
