const VALIDATE_MS_MIN = 900;
const VALIDATE_MS_MAX = 1800;
const PUBLISH_MS_MIN = 1000;
const PUBLISH_MS_MAX = 2200;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

async function runValidation() {
  await delay(randomBetween(VALIDATE_MS_MIN, VALIDATE_MS_MAX));
  const valid = Math.random() >= 0.5;
  if (valid) {
    return {
      valid: true,
      message: 'Content and path checks passed.',
    };
  }
  return {
    valid: false,
    message: 'Validation failed: missing metadata or blocked path.',
  };
}

async function runPublish() {
  await delay(randomBetween(PUBLISH_MS_MIN, PUBLISH_MS_MAX));
}

function setPhase(li, phase) {
  li.dataset.phase = phase;
}

function setDetail(li, text) {
  const detail = li.querySelector('.publish-live__detail');
  if (detail) detail.textContent = text;
}

function getSteps(live) {
  return {
    validate: live.querySelector('#publish-step-validate'),
    publish: live.querySelector('#publish-step-publish'),
  };
}

async function runPublishFlow(ui) {
  const { btn, live, announcer } = ui;
  const { validate: validateLi, publish: publishLi } = getSteps(live);
  if (!validateLi || !publishLi) return;

  btn.disabled = true;

  setPhase(validateLi, 'active');
  setDetail(validateLi, '');
  setPhase(publishLi, 'deactivated');
  setDetail(publishLi, 'Waiting for validation…');
  announcer.textContent = 'Validating.';

  const validation = await runValidation();

  if (!validation.valid) {
    setPhase(validateLi, 'error');
    setDetail(validateLi, validation.message);
    setPhase(publishLi, 'deactivated');
    setDetail(publishLi, 'Skipped — validation did not pass.');
    announcer.textContent = `Validation failed. ${validation.message}`;
    btn.disabled = false;
    return;
  }

  setPhase(validateLi, 'done');
  setDetail(validateLi, validation.message);

  setPhase(publishLi, 'active');
  setDetail(publishLi, 'Publishing changes…');
  announcer.textContent = 'Validation passed. Publishing.';

  await runPublish();

  setPhase(publishLi, 'done');
  setDetail(publishLi, 'Publish completed successfully.');
  announcer.textContent = 'Publishing finished successfully.';

  btn.disabled = false;
}

function init() {
  const btn = document.getElementById('publish-run');
  const live = document.getElementById('publish-live');
  const announcer = document.getElementById('publish-announcer');

  if (!btn || !live || !announcer) return;

  btn.addEventListener('click', () => {
    runPublishFlow({ btn, live, announcer }).catch(() => {
      announcer.textContent = 'Something went wrong.';
      btn.disabled = false;
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
