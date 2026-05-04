import { html } from 'https://da.live/nx/deps/lit/lit-core.min.js';

/**
 * Shared progress-ring template used in loading states.
 * CSS classes are defined in `audit.css`.
 */
export function renderProgressRing() {
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
