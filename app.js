/**
 * Digital Hijab Catalog — static center overlay
 *
 * Vanilla HTML/CSS/JS. Mirrored webcam + fixed-center hijab PNG.
 * User aligns their head manually; size via slider.
 */

import {
  CATALOG,
  DEFAULT_STYLE_ID,
  DEFAULT_COLOR_ID,
} from './catalog.js';

// =============================================================================
// CONFIG — static placement on canvas
// =============================================================================

const CONFIG = {
  HIJAB_BASE_WIDTH_RATIO: 0.38,
  CENTER_Y_OFFSET_RATIO: -0.06,
};

// =============================================================================
// Selection state
// =============================================================================

let selectedStyleId = DEFAULT_STYLE_ID;
let selectedColorId = DEFAULT_COLOR_ID;
let userScaleMultiplier = 0.85;

/** @type {Map<string, { img: HTMLImageElement, bounds: { x: number, y: number, w: number, h: number } }>} */
const imageCache = new Map();

// =============================================================================
// DOM
// =============================================================================

const video = document.getElementById('webcam');
const canvas = document.getElementById('output_canvas');
const ctx = canvas.getContext('2d');
const stylePickerEl = document.getElementById('style_picker');
const colorPickerEl = document.getElementById('color_picker');
const sizeSliderEl = document.getElementById('size_slider');
const sizeValueEl = document.getElementById('size_value');
const controlsPanelEl = document.getElementById('controls_panel');
const controlsToggleEl = document.getElementById('controls_toggle');

// =============================================================================
// Catalog helpers
// =============================================================================

function getStyle(styleId) {
  return CATALOG.find((s) => s.id === styleId);
}

function getActiveColorEntry() {
  const style = getStyle(selectedStyleId);
  if (!style) return null;
  return (
    style.colors.find((c) => c.id === selectedColorId) ?? style.colors[0]
  );
}

function getActiveHijabAsset() {
  const entry = getActiveColorEntry();
  if (!entry) return null;
  return imageCache.get(entry.src) ?? null;
}

/**
 * Scan alpha channel to find tight bounds of visible artwork,
 * ignoring transparent padding in Figma exports.
 */
function computeContentBounds(img) {
  const offscreen = document.createElement('canvas');
  offscreen.width = img.naturalWidth;
  offscreen.height = img.naturalHeight;
  const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
  offCtx.drawImage(img, 0, 0);

  const w = offscreen.width;
  const h = offscreen.height;
  const { data, width, height } = offCtx.getImageData(0, 0, w, h);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) {
    return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// =============================================================================
// Hijab overlay — fixed center, slider-scaled
// =============================================================================

function drawHijab() {
  const asset = getActiveHijabAsset();
  if (!asset) return;

  const { img, bounds } = asset;
  const hijabWidth =
    canvas.width * CONFIG.HIJAB_BASE_WIDTH_RATIO * userScaleMultiplier;
  const hijabHeight = hijabWidth * (bounds.h / bounds.w);

  const drawX = (canvas.width - hijabWidth) / 2;
  const drawY =
    (canvas.height - hijabHeight) / 2 +
    canvas.height * CONFIG.CENTER_Y_OFFSET_RATIO;

  ctx.drawImage(
    img,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    drawX,
    drawY,
    hijabWidth,
    hijabHeight
  );
}

function drawMirroredVideo() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function renderLoop() {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    drawMirroredVideo();
    drawHijab();
  }

  requestAnimationFrame(renderLoop);
}

// =============================================================================
// Camera init
// =============================================================================

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.srcObject = stream;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

/** Preload all catalog PNGs for instant style/color switching */
async function preloadCatalogImages() {
  const srcs = CATALOG.flatMap((style) =>
    style.colors.map((color) => color.src)
  );

  await Promise.all(
    srcs.map(async (src) => {
      const img = await loadImage(src);
      const bounds = computeContentBounds(img);
      imageCache.set(src, { img, bounds });
    })
  );
}

function showError(message) {
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message, canvas.width / 2 || 200, canvas.height / 2 || 100);
}

// =============================================================================
// Customization UI
// =============================================================================

function renderColorPicker() {
  const style = getStyle(selectedStyleId);
  if (!style) return;

  colorPickerEl.innerHTML = '';

  style.colors.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-picker__btn';
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-label', color.name);
    btn.setAttribute('aria-selected', color.id === selectedColorId ? 'true' : 'false');
    btn.style.backgroundColor = color.hex;
    if (color.id === selectedColorId) {
      btn.classList.add('is-active');
    }

    btn.addEventListener('click', () => {
      selectedColorId = color.id;
      renderColorPicker();
    });

    colorPickerEl.appendChild(btn);
  });
}

function renderStylePicker() {
  stylePickerEl.innerHTML = '';

  CATALOG.forEach((style) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'style-picker__btn';
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', style.id === selectedStyleId ? 'true' : 'false');
    if (style.id === selectedStyleId) {
      btn.classList.add('is-active');
    }

    btn.textContent = style.name;

    btn.addEventListener('click', () => {
      selectedStyleId = style.id;
      const styleEntry = getStyle(selectedStyleId);
      const hasColor = styleEntry?.colors.some((c) => c.id === selectedColorId);
      if (!hasColor && styleEntry) {
        selectedColorId = styleEntry.colors[0].id;
      }
      renderStylePicker();
      renderColorPicker();
    });

    stylePickerEl.appendChild(btn);
  });
}

function setControlsOpen(open) {
  controlsToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  controlsToggleEl.setAttribute(
    'aria-label',
    open ? 'Close hijab options' : 'Open hijab options'
  );
  controlsPanelEl.setAttribute('aria-hidden', open ? 'false' : 'true');
  controlsPanelEl.classList.toggle('is-open', open);
}

function initControls() {
  renderStylePicker();
  renderColorPicker();
  setControlsOpen(false);

  controlsToggleEl.addEventListener('click', () => {
    const isOpen = controlsToggleEl.getAttribute('aria-expanded') === 'true';
    setControlsOpen(!isOpen);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && controlsToggleEl.getAttribute('aria-expanded') === 'true') {
      setControlsOpen(false);
    }
  });

  sizeSliderEl.addEventListener('input', () => {
    const value = Number(sizeSliderEl.value);
    userScaleMultiplier = value / 100;
    sizeValueEl.textContent = `${value}%`;
    sizeSliderEl.setAttribute('aria-valuenow', String(value));
  });
}

// =============================================================================
// Bootstrap
// =============================================================================

async function main() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  try {
    initControls();
    await preloadCatalogImages();
    await initCamera();
    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error(err);
    showError(
      err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow webcam access.'
        : `Error: ${err.message}`
    );
  }
}

main();
