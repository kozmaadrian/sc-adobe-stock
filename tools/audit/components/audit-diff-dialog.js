import { html, LitElement } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import {
  fetchLatestDocumentSource,
  fetchVersionSourceByUrl,
} from '../utils/api.js';
import {
  formatSmartTime,
  parseTimestamp,
  pathForDisplay,
} from '../lib/audit-formatters.js';
import { renderProgressRing } from './audit-progress-ring.js';

const EL_NAME = 'audit-diff-dialog';
const DIFF_CDN_URL = 'https://cdn.jsdelivr.net/npm/diff@9.0.0/dist/diff.min.js';
const PRETTIER_STANDALONE_CDN_URL = 'https://cdn.jsdelivr.net/npm/prettier@3.3.3/standalone.js';
const PRETTIER_HTML_PLUGIN_CDN_URL = 'https://cdn.jsdelivr.net/npm/prettier@3.3.3/plugins/html.js';
const LATEST_DIFF_OPTION_ID = '__latest__';
const DEFAULT_DIFF_MODE_ID = 'lines';
const DIFF_MODE_OPTIONS = [
  {
    id: 'lines',
    label: 'Lines',
    method: 'diffLines',
    options: { newlineIsToken: true },
  },
  {
    id: 'words',
    label: 'Words',
    method: 'diffWords',
  },
  {
    id: 'words-space',
    label: 'Words + spaces',
    method: 'diffWordsWithSpace',
  },
  {
    id: 'chars',
    label: 'Characters',
    method: 'diffChars',
  },
  {
    id: 'sentences',
    label: 'Sentences',
    method: 'diffSentences',
  },
  {
    id: 'css',
    label: 'CSS tokens',
    method: 'diffCss',
  },
];

let diffLibraryPromise;
let htmlFormatterPromise;

function toDiffOptionId(versionId) {
  return `version:${versionId}`;
}

function summarizeVersionId(versionId) {
  const normalized = String(versionId || '').replace(/\.html$/i, '');
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 8)}...`;
}

function normalizeVersionOptions(versions) {
  const options = [{
    id: LATEST_DIFF_OPTION_ID,
    type: 'latest',
    label: 'Latest source (current content)',
  }];

  if (!Array.isArray(versions)) return options;

  const seenIds = new Set();
  const deduped = [];

  versions.forEach((entry) => {
    const versionId = typeof entry?.versionId === 'string' ? entry.versionId.trim() : '';
    const versionUrl = typeof entry?.url === 'string' ? entry.url.trim() : '';
    if (!versionId || !versionUrl || seenIds.has(versionId)) return;
    seenIds.add(versionId);

    const timestamp = parseTimestamp(entry?.timestamp);
    const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
    const rawLabel = typeof entry?.label === 'string' ? entry.label.trim() : '';
    const labelPrefix = rawLabel || 'Version';
    const timeLabel = safeTimestamp ? formatSmartTime(safeTimestamp) : 'Unknown time';

    deduped.push({
      id: toDiffOptionId(versionId),
      type: 'version',
      versionId,
      versionUrl,
      timestamp: safeTimestamp,
      label: `${labelPrefix} · ${timeLabel} · ${summarizeVersionId(versionId)}`,
    });
  });

  deduped.sort((left, right) => right.timestamp - left.timestamp);
  return [...options, ...deduped];
}

function getDiffModeConfig(modeId) {
  return DIFF_MODE_OPTIONS.find((mode) => mode.id === modeId)
    || DIFF_MODE_OPTIONS[0];
}

function loadExternalScript(url) {
  const existingScript = Array.from(document.querySelectorAll('script'))
    .find((scriptEl) => scriptEl.src === url);

  if (existingScript) {
    if (existingScript.dataset.cursorLoaded === 'true'
      || existingScript.readyState === 'complete'
      || existingScript.readyState === 'loaded') {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`Failed to load script: ${url}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      script.dataset.cursorLoaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.append(script);
  });
}

async function loadDiffLibrary() {
  if (window.Diff?.diffLines) return window.Diff;
  if (!diffLibraryPromise) {
    diffLibraryPromise = (async () => {
      await loadExternalScript(DIFF_CDN_URL);
      if (!window.Diff?.diffLines) {
        throw new Error('Diff library loaded but window.Diff is unavailable.');
      }
      return window.Diff;
    })().catch((error) => {
      diffLibraryPromise = undefined;
      throw error;
    });
  }

  return diffLibraryPromise;
}

async function loadHtmlFormatterLibrary() {
  if (window.prettier?.format && window.prettierPlugins?.html) {
    return {
      prettier: window.prettier,
      plugins: [window.prettierPlugins.html],
    };
  }

  if (!htmlFormatterPromise) {
    htmlFormatterPromise = (async () => {
      await loadExternalScript(PRETTIER_STANDALONE_CDN_URL);
      await loadExternalScript(PRETTIER_HTML_PLUGIN_CDN_URL);
      if (!window.prettier?.format || !window.prettierPlugins?.html) {
        throw new Error('HTML formatter loaded but unavailable on window.');
      }
      return {
        prettier: window.prettier,
        plugins: [window.prettierPlugins.html],
      };
    })().catch((error) => {
      htmlFormatterPromise = undefined;
      throw error;
    });
  }

  return htmlFormatterPromise;
}

function inferDiffContentKind(path, text) {
  const pathLower = typeof path === 'string' ? path.toLowerCase() : '';
  if (pathLower.endsWith('.json')) return 'json';
  if (pathLower.endsWith('.html') || pathLower.endsWith('.htm') || pathLower.endsWith('.svg')) return 'html';

  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) return 'text';
  if ((source.startsWith('{') && source.endsWith('}'))
    || (source.startsWith('[') && source.endsWith(']'))) {
    return 'json';
  }
  if (source.startsWith('<') && source.includes('>')) return 'html';
  return 'text';
}

function normalizeJsonForDiff(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function normalizeContentForDiff(text, pathHint) {
  const source = typeof text === 'string' ? text : '';
  const contentKind = inferDiffContentKind(pathHint, source);

  if (contentKind === 'json') {
    return normalizeJsonForDiff(source);
  }

  if (contentKind === 'html') {
    try {
      const formatter = await loadHtmlFormatterLibrary();
      const formatted = await formatter.prettier.format(source, {
        parser: 'html',
        plugins: formatter.plugins,
        printWidth: 120,
        htmlWhitespaceSensitivity: 'css',
      });
      return typeof formatted === 'string' ? formatted : source;
    } catch {
      return source;
    }
  }

  return source;
}

function normalizeVersionSignature(versions) {
  if (!Array.isArray(versions)) return '';
  return versions
    .map((entry) => `${entry?.versionId || ''}|${entry?.url || ''}|${entry?.timestamp || ''}`)
    .join(';');
}

class AuditDiffDialog extends LitElement {
  static properties = {
    open: { type: Boolean },
    path: { type: String },
    versions: { type: Array },
    requestedVersionId: { type: String },
    org: { type: String },
    site: { type: String },
    token: { type: String },
    _diffOptions: { state: true },
    _diffLeftOptionId: { state: true },
    _diffRightOptionId: { state: true },
    _diffMode: { state: true },
    _diffChunks: { state: true },
    _diffError: { state: true },
    _isDiffLoading: { state: true },
  };

  constructor() {
    super();
    this.open = false;
    this.path = '';
    this.versions = [];
    this.requestedVersionId = '';
    this.org = '';
    this.site = '';
    this.token = '';
    this._diffOptions = [];
    this._diffLeftOptionId = LATEST_DIFF_OPTION_ID;
    this._diffRightOptionId = '';
    this._diffMode = DEFAULT_DIFF_MODE_ID;
    this._diffChunks = [];
    this._diffError = '';
    this._isDiffLoading = false;
    this._activeDiffRequest = 0;
    this._lastOpenSignature = '';
  }

  createRenderRoot() {
    return this;
  }

  updated(changedProperties) {
    const openChanged = changedProperties.has('open');
    const externalChanged = changedProperties.has('open')
      || changedProperties.has('path')
      || changedProperties.has('versions')
      || changedProperties.has('requestedVersionId')
      || changedProperties.has('org')
      || changedProperties.has('site')
      || changedProperties.has('token');
    if (!externalChanged) return;

    if (!this.open) {
      this.resetState();
      this._lastOpenSignature = '';
      return;
    }

    if (openChanged) {
      this.focusDialogForKeyboardNavigation();
    }

    const signature = [
      this.path,
      this.requestedVersionId,
      this.org,
      this.site,
      normalizeVersionSignature(this.versions),
    ].join('::');
    if (signature === this._lastOpenSignature) return;

    this._lastOpenSignature = signature;
    this.initializeDiffState();
  }

  focusDialogForKeyboardNavigation() {
    requestAnimationFrame(() => {
      const overlay = this.querySelector('.audit-diff-overlay');
      if (overlay instanceof HTMLElement) {
        overlay.focus({ preventScroll: true });
      }
    });
  }

  resetState() {
    this._activeDiffRequest += 1;
    this._isDiffLoading = false;
    this._diffError = '';
    this._diffChunks = [];
    this._diffOptions = [];
    this._diffLeftOptionId = LATEST_DIFF_OPTION_ID;
    this._diffRightOptionId = '';
    this._diffMode = DEFAULT_DIFF_MODE_ID;
  }

  initializeDiffState() {
    const options = normalizeVersionOptions(this.versions);
    const firstVersionOption = options.find((option) => option.type === 'version');

    this._diffOptions = options;
    this._diffMode = DEFAULT_DIFF_MODE_ID;
    this._diffError = '';
    this._diffChunks = [];

    if (!firstVersionOption) {
      this._diffLeftOptionId = LATEST_DIFF_OPTION_ID;
      this._diffRightOptionId = LATEST_DIFF_OPTION_ID;
      this._isDiffLoading = false;
      this._diffError = 'No saved versions are available for this path.';
      return;
    }

    const requestedOptionId = this.requestedVersionId
      ? toDiffOptionId(this.requestedVersionId)
      : '';
    const hasRequestedOption = requestedOptionId
      && options.some((option) => option.id === requestedOptionId);

    this._diffLeftOptionId = hasRequestedOption
      ? requestedOptionId
      : firstVersionOption.id;
    this._diffRightOptionId = LATEST_DIFF_OPTION_ID;
    void this.loadDiffForSelection();
  }

  getDiffOptionById(id) {
    return this._diffOptions.find((option) => option.id === id) || null;
  }

  async fetchSourceForDiffOption(option) {
    if (option?.type === 'latest') {
      return fetchLatestDocumentSource(this.org, this.site, this.path, this.token);
    }
    if (option?.type === 'version') {
      return fetchVersionSourceByUrl(option.versionUrl, this.token);
    }
    return { success: false, error: 'Unknown diff source option.' };
  }

  async loadDiffForSelection() {
    const leftOption = this.getDiffOptionById(this._diffLeftOptionId);
    const rightOption = this.getDiffOptionById(this._diffRightOptionId);
    if (!leftOption || !rightOption) {
      this._isDiffLoading = false;
      this._diffError = 'Select two versions to compare.';
      this._diffChunks = [];
      return;
    }

    const requestId = ++this._activeDiffRequest;
    this._isDiffLoading = true;
    this._diffError = '';
    this._diffChunks = [];

    const [leftResult, rightResult, diffLibrary] = await Promise.all([
      this.fetchSourceForDiffOption(leftOption),
      this.fetchSourceForDiffOption(rightOption),
      loadDiffLibrary(),
    ]).catch((error) => {
      if (requestId !== this._activeDiffRequest) return [null, null, null];
      this._isDiffLoading = false;
      this._diffError = error instanceof Error ? error.message : 'Failed to load diff.';
      return [null, null, null];
    });

    if (requestId !== this._activeDiffRequest) return;
    if (!leftResult || !rightResult || !diffLibrary) return;
    if (!leftResult.success || !rightResult.success) {
      this._isDiffLoading = false;
      this._diffError = [
        leftResult.success ? '' : leftResult.error,
        rightResult.success ? '' : rightResult.error,
      ]
        .filter(Boolean)
        .join(' ');
      return;
    }

    const modeConfig = getDiffModeConfig(this._diffMode);
    const diffFunction = diffLibrary?.[modeConfig.method];
    if (typeof diffFunction !== 'function') {
      this._isDiffLoading = false;
      this._diffError = `Compare mode "${modeConfig.label}" is unavailable in jsdiff.`;
      return;
    }

    let parts = [];
    try {
      const [normalizedLeftSource, normalizedRightSource] = await Promise.all([
        normalizeContentForDiff(leftResult.source, this.path),
        normalizeContentForDiff(rightResult.source, this.path),
      ]);
      parts = diffFunction(
        normalizedLeftSource,
        normalizedRightSource,
        modeConfig.options ? { ...modeConfig.options } : undefined,
      );
    } catch (error) {
      this._isDiffLoading = false;
      this._diffError = error instanceof Error ? error.message : 'Failed to generate diff.';
      return;
    }

    this._diffChunks = Array.isArray(parts)
      ? parts
        .filter((part) => typeof part?.value === 'string' && part.value.length > 0)
        .map((part) => ({
          type: part.added ? 'added' : part.removed ? 'removed' : 'common',
          value: part.value,
        }))
      : [];
    this._isDiffLoading = false;
  }

  handleDiffModeChange(event) {
    const nextMode = typeof event?.target?.value === 'string' ? event.target.value : '';
    const modeConfig = getDiffModeConfig(nextMode);
    if (modeConfig.id === this._diffMode) return;
    this._diffMode = modeConfig.id;
    void this.loadDiffForSelection();
  }

  handleDiffOptionChange(side, event) {
    const value = typeof event?.target?.value === 'string' ? event.target.value : '';
    if (!value) return;
    if (side === 'left') this._diffLeftOptionId = value;
    if (side === 'right') this._diffRightOptionId = value;
    void this.loadDiffForSelection();
  }

  getVersionOnlyOptions() {
    return this._diffOptions.filter((option) => option.type === 'version');
  }

  getSelectedVersionIndex(side) {
    const versionOptions = this.getVersionOnlyOptions();
    if (!versionOptions.length) return -1;
    const selectedId = side === 'right'
      ? this._diffRightOptionId
      : this._diffLeftOptionId;
    return versionOptions.findIndex((option) => option.id === selectedId);
  }

  canStepVersion(side, delta) {
    const versionOptions = this.getVersionOnlyOptions();
    if (!versionOptions.length) return false;

    const currentIndex = this.getSelectedVersionIndex(side);
    if (currentIndex === -1) {
      return delta > 0;
    }

    const nextIndex = currentIndex + delta;
    return nextIndex >= 0 && nextIndex < versionOptions.length;
  }

  stepVersion(side, delta) {
    const versionOptions = this.getVersionOnlyOptions();
    if (!versionOptions.length) return;

    let nextIndex;
    const currentIndex = this.getSelectedVersionIndex(side);
    if (currentIndex === -1) {
      if (delta <= 0) return;
      nextIndex = 0;
    } else {
      nextIndex = currentIndex + delta;
      if (nextIndex < 0 || nextIndex >= versionOptions.length) return;
    }

    const nextOptionId = versionOptions[nextIndex]?.id || '';
    if (!nextOptionId) return;

    if (side === 'right') {
      if (nextOptionId === this._diffRightOptionId) return;
      this._diffRightOptionId = nextOptionId;
    } else {
      if (nextOptionId === this._diffLeftOptionId) return;
      this._diffLeftOptionId = nextOptionId;
    }

    void this.loadDiffForSelection();
  }

  handleStepClick(side, delta, event) {
    event.preventDefault();
    this.stepVersion(side, delta);
  }

  handleDialogKeydown(event) {
    const key = event?.key || '';
    if (key !== 'Escape') return;
    event.preventDefault();
    this.dispatchClose();
  }

  dispatchClose() {
    this.dispatchEvent(new CustomEvent('audit-close-diff', {
      bubbles: true,
      composed: true,
    }));
  }

  handleOverlayClick(event) {
    if (event.target !== event.currentTarget) return;
    this.dispatchClose();
  }

  renderDialogCloseIcon() {
    return html`
      <svg
        class="icon-tool-trigger__icon"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M3.72 3.72A.75.75 0 0 1 4.78 3.72L8 6.94L11.22 3.72A.75.75 0 1 1 12.28 4.78L9.06 8L12.28 11.22A.75.75 0 1 1 11.22 12.28L8 9.06L4.78 12.28A.75.75 0 1 1 3.72 11.22L6.94 8L3.72 4.78A.75.75 0 0 1 3.72 3.72Z"
        />
      </svg>
    `;
  }

  renderStepIcon(direction) {
    if (direction === 'up') {
      return html`
        <svg
          class="icon-tool-trigger__icon"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill="#292929"
            d="M3.54492 12.2373C3.54492 12.041 3.62207 11.8437 3.77539 11.6973L9.47851 6.20996C9.76855 5.92969 10.2275 5.92969 10.5176 6.20996L16.2344 11.71C16.5332 11.9971 16.542 12.4727 16.2549 12.7695C15.9678 13.0684 15.4932 13.0781 15.1953 12.79L9.99804 7.79102L4.81445 12.7773C4.5166 13.0654 4.04199 13.0557 3.75488 12.7568C3.61426 12.6123 3.54492 12.4248 3.54492 12.2373Z"
          />
        </svg>
      `;
    }

    return html`
      <svg
        class="icon-tool-trigger__icon"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          fill="#292929"
          d="M3.75488 7.24315C4.04199 6.94432 4.5166 6.93455 4.81445 7.22264L9.99804 12.209L15.1953 7.20995C15.4932 6.92187 15.9678 6.93163 16.2549 7.23046C16.542 7.52733 16.5332 8.00292 16.2344 8.29003L10.5176 13.79C10.2275 14.0703 9.76855 14.0703 9.47851 13.79L3.77539 8.30273C3.62207 8.15624 3.54492 7.95898 3.54492 7.76269C3.54492 7.57518 3.61426 7.38768 3.75488 7.24315Z"
        />
      </svg>
    `;
  }

  renderDiffBody() {
    if (this._isDiffLoading) {
      return html`
        <div class="audit-diff-state" role="status" aria-live="polite" aria-busy="true">
          <div class="audit-detail-state__figure">${renderProgressRing()}</div>
          <p class="audit-detail-state__message audit-detail-state__message--loading">
            Loading diff...
          </p>
        </div>
      `;
    }

    if (this._diffError) {
      return html`<p class="audit-diff-message audit-diff-message--error">${this._diffError}</p>`;
    }

    if (!this._diffChunks.length) {
      return html`
        <p class="audit-diff-message">
          No differences between the selected versions.
        </p>
      `;
    }

    const hasChanges = this._diffChunks.some((chunk) => chunk.type !== 'common');
    if (!hasChanges) {
      return html`
        <p class="audit-diff-message">
          No differences between the selected versions.
        </p>
      `;
    }

    return html`
      <div class="audit-diff-split" aria-live="polite">
        <div class="audit-diff-split__rows">
          ${this._diffChunks.map((chunk) => {
            const leftValue = chunk.type === 'added' ? '' : chunk.value;
            const rightValue = chunk.type === 'removed' ? '' : chunk.value;
            const leftType = chunk.type === 'removed'
              ? 'removed'
              : (chunk.type === 'common' ? 'common' : 'empty');
            const rightType = chunk.type === 'added'
              ? 'added'
              : (chunk.type === 'common' ? 'common' : 'empty');
            return html`
              <div class="audit-diff-split__row">
                <pre class="audit-diff-split__cell audit-diff-split__cell--${leftType}">${leftValue}</pre>
                <pre class="audit-diff-split__cell audit-diff-split__cell--${rightType}">${rightValue}</pre>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.open) return '';
    const canStepFromNewer = this.canStepVersion('left', -1);
    const canStepFromOlder = this.canStepVersion('left', 1);
    const canStepToNewer = this.canStepVersion('right', -1);
    const canStepToOlder = this.canStepVersion('right', 1);

    return html`
      <div
        class="audit-diff-overlay"
        role="dialog"
        aria-modal="true"
        tabindex="0"
        @click=${this.handleOverlayClick}
        @keydown=${this.handleDialogKeydown}
      >
        <section class="audit-diff-dialog" aria-label="Version compare dialog">
          <header class="audit-diff-dialog__head">
            <div>
              <h2 class="audit-diff-dialog__title">Compare versions</h2>
              <p class="audit-diff-dialog__path">
                <code>${pathForDisplay(this.path)}</code>
              </p>
            </div>
            <button
              type="button"
              class="icon-tool-trigger audit-diff-dialog__close"
              title="Close compare dialog"
              aria-label="Close compare dialog"
              @click=${this.dispatchClose}
            >
              ${this.renderDialogCloseIcon()}
            </button>
          </header>
          <div class="audit-diff-dialog__controls">
            <label class="audit-diff-dialog__field audit-diff-dialog__field--mode">
              <span class="field-label">Compare by</span>
              <select
                class="field"
                @change=${this.handleDiffModeChange}
              >
                ${DIFF_MODE_OPTIONS.map((mode) => html`
                  <option value=${mode.id} ?selected=${mode.id === this._diffMode}>
                    ${mode.label}
                  </option>
                `)}
              </select>
            </label>
            <div
              class="audit-diff-dialog__selector-grid"
              role="group"
              aria-label="Version selectors"
            >
              <label class="audit-diff-dialog__field">
                <div class="audit-diff-dialog__field-row">
                  <button
                    type="button"
                    class="icon-tool-trigger audit-diff-step-trigger"
                    title="Newer version"
                    aria-label="Newer from version"
                    ?disabled=${!canStepFromNewer}
                    @click=${(event) => this.handleStepClick('left', -1, event)}
                  >
                    ${this.renderStepIcon('up')}
                  </button>
                  <select
                    class="field"
                    aria-label="From version"
                    @change=${(event) => this.handleDiffOptionChange('left', event)}
                  >
                    ${this._diffOptions.map((option) => html`
                      <option
                        value=${option.id}
                        ?selected=${option.id === this._diffLeftOptionId}
                      >
                        ${option.label}
                      </option>
                    `)}
                  </select>
                  <button
                    type="button"
                    class="icon-tool-trigger audit-diff-step-trigger"
                    title="Older version"
                    aria-label="Older from version"
                    ?disabled=${!canStepFromOlder}
                    @click=${(event) => this.handleStepClick('left', 1, event)}
                  >
                    ${this.renderStepIcon('down')}
                  </button>
                </div>
              </label>
              <label class="audit-diff-dialog__field">
                <div class="audit-diff-dialog__field-row">
                  <button
                    type="button"
                    class="icon-tool-trigger audit-diff-step-trigger"
                    title="Newer version"
                    aria-label="Newer to version"
                    ?disabled=${!canStepToNewer}
                    @click=${(event) => this.handleStepClick('right', -1, event)}
                  >
                    ${this.renderStepIcon('up')}
                  </button>
                  <select
                    class="field"
                    aria-label="To version"
                    @change=${(event) => this.handleDiffOptionChange('right', event)}
                  >
                    ${this._diffOptions.map((option) => html`
                      <option
                        value=${option.id}
                        ?selected=${option.id === this._diffRightOptionId}
                      >
                        ${option.label}
                      </option>
                    `)}
                  </select>
                  <button
                    type="button"
                    class="icon-tool-trigger audit-diff-step-trigger"
                    title="Older version"
                    aria-label="Older to version"
                    ?disabled=${!canStepToOlder}
                    @click=${(event) => this.handleStepClick('right', 1, event)}
                  >
                    ${this.renderStepIcon('down')}
                  </button>
                </div>
              </label>
            </div>
          </div>
          <div class="audit-diff-dialog__body">
            ${this.renderDiffBody()}
          </div>
        </section>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, AuditDiffDialog);
}
