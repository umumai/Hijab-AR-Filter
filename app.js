/**
 * Digital Hijab Catalog — MVP (Route A)
 *
 * Vanilla HTML/CSS/JS + MediaPipe Face Mesh CDN.
 * Mirrors webcam to canvas, tracks one face, overlays a 2D hijab PNG.
 */

// =============================================================================
// CONFIG — tune these when swapping Figma assets
// =============================================================================

const CONFIG = {
  // SWAP: Replace with your Figma export path (transparent PNG, anchor at top-center)
  HIJAB_IMAGE_PATH: 'hijab.png',

  // Hijab width = cheek-to-cheek distance × this multiplier
  HIJAB_WIDTH_MULTIPLIER: 2.2,

  // Fraction of hijab height placed above landmark #10 (forehead center)
  ANCHOR_Y_OFFSET: 0.15,

  // MediaPipe Face Mesh landmark indices
  FOREHEAD_LANDMARK: 10,
  LEFT_CHEEK_LANDMARK: 234,
  RIGHT_CHEEK_LANDMARK: 454,
  FALLBACK_FOREHEAD_LANDMARK: 152,
};

// =============================================================================
// DOM references
// =============================================================================

const video = document.getElementById('webcam');
const canvas = document.getElementById('output_canvas');
const ctx = canvas.getContext('2d');

// Preloaded hijab graphic — swap CONFIG.HIJAB_IMAGE_PATH for Figma exports
const hijabImg = new Image();

// Latest landmarks from Face Mesh (updated in onResults, read in render loop if needed)
let latestLandmarks = null;

// Face Mesh instance (initialized after camera is ready)
let faceMesh = null;

// =============================================================================
// Coordinate helpers — landmarks are normalized 0–1; canvas is mirrored on X
// =============================================================================

/**
 * Convert a normalized landmark X to canvas pixels (mirrored for selfie view).
 */
function toCanvasX(landmark) {
  return (1 - landmark.x) * canvas.width;
}

/**
 * Convert a normalized landmark Y to canvas pixels.
 */
function toCanvasY(landmark) {
  return landmark.y * canvas.height;
}

/**
 * Euclidean distance between two landmarks on the mirrored canvas.
 */
function landmarkDistance(a, b) {
  return Math.hypot(toCanvasX(a) - toCanvasX(b), toCanvasY(a) - toCanvasY(b));
}

// =============================================================================
// HIJAB OVERLAY — swap hijab.png via CONFIG.HIJAB_IMAGE_PATH
// =============================================================================

/**
 * Draw the hijab PNG anchored to forehead landmark #10, scaled by cheek width.
 * Called from onResults (per Face Mesh callback) and after inference in renderLoop
 * so the overlay stays aligned with the mirrored frame.
 */
function drawHijab(landmarks) {
  // Primary anchor: forehead center (#10); fallback to #152 if missing
  const anchor =
    landmarks[CONFIG.FOREHEAD_LANDMARK] ??
    landmarks[CONFIG.FALLBACK_FOREHEAD_LANDMARK];

  if (!anchor) return;

  const leftCheek = landmarks[CONFIG.LEFT_CHEEK_LANDMARK];
  const rightCheek = landmarks[CONFIG.RIGHT_CHEEK_LANDMARK];

  if (!leftCheek || !rightCheek) return;

  // Scale hijab width from cheek-to-cheek distance (face closer = wider cheeks in px)
  const cheekDist = landmarkDistance(leftCheek, rightCheek);
  const hijabWidth = cheekDist * CONFIG.HIJAB_WIDTH_MULTIPLIER;
  const hijabHeight = hijabWidth * (hijabImg.height / hijabImg.width);

  // Anchor top-center of PNG to forehead landmark
  const anchorX = toCanvasX(anchor);
  const anchorY = toCanvasY(anchor);
  const drawX = anchorX - hijabWidth / 2;
  const drawY = anchorY - hijabHeight * CONFIG.ANCHOR_Y_OFFSET;

  ctx.drawImage(hijabImg, drawX, drawY, hijabWidth, hijabHeight);
}

/**
 * Draw mirrored webcam frame onto the canvas (selfie mirror UX).
 */
function drawMirroredVideo() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// =============================================================================
// THE AI BRAIN — MediaPipe Face Mesh callback
// =============================================================================

/**
 * Called when Face Mesh finishes processing a frame.
 * Locates facial landmarks and draws the hijab overlay on the canvas.
 */
function onResults(results) {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    latestLandmarks = null;
    return;
  }

  latestLandmarks = results.multiFaceLandmarks[0];
  drawHijab(latestLandmarks);
}

// =============================================================================
// THE RENDER LOOP — requestAnimationFrame (NOT setInterval)
// =============================================================================

/**
 * Each frame: clear canvas, draw mirrored webcam, feed frame to Face Mesh.
 * Hijab is drawn in onResults when landmarks are available.
 */
async function renderLoop() {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    // 1. Clear and draw mirrored webcam (selfie mirror UX)
    drawMirroredVideo();

    // 2. Feed the hidden video frame into Face Mesh
    if (faceMesh) {
      await faceMesh.send({ image: video });

      // 3. Re-draw hijab after inference so overlay matches the current frame
      if (latestLandmarks) {
        drawHijab(latestLandmarks);
      }
    }
  }

  requestAnimationFrame(renderLoop);
}

// =============================================================================
// THE CAMERA — getUserMedia → hidden video element
// =============================================================================

/**
 * Request webcam access and pipe stream into the hidden <video>.
 */
async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false,
  });

  video.srcObject = stream;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  await video.play();

  // Match canvas internal resolution to video for accurate landmark mapping
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

/**
 * Initialize MediaPipe Face Mesh — single face, CDN-hosted WASM/models.
 */
function initFaceMesh() {
  faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.onResults(onResults);
}

/**
 * Preload hijab PNG before starting the render loop.
 */
function loadHijabImage() {
  return new Promise((resolve, reject) => {
    hijabImg.onload = resolve;
    hijabImg.onerror = () =>
      reject(new Error(`Failed to load hijab image: ${CONFIG.HIJAB_IMAGE_PATH}`));
    hijabImg.src = CONFIG.HIJAB_IMAGE_PATH;
  });
}

/**
 * Show a simple error message on the canvas when startup fails.
 */
function showError(message) {
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message, canvas.width / 2 || 200, canvas.height / 2 || 100);
}

// =============================================================================
// Bootstrap
// =============================================================================

async function main() {
  // Default canvas size until video metadata loads (for error display)
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  try {
    await loadHijabImage();
    await initCamera();
    initFaceMesh();
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
