const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fgInput = document.getElementById("foregroundInput");
const bgInput = document.getElementById("backgroundInput");
const downloadBtn = document.getElementById("downloadBtn");

const posX = document.getElementById("posX");
const posY = document.getElementById("posY");
const scaleSlider = document.getElementById("scale");
const rotateSlider = document.getElementById("rotate");

const brushModeSelect = document.getElementById("brushMode");
const brushSizeSlider = document.getElementById("brushSize");
const toggleBrushBtn = document.getElementById("toggleBrush");

// ---------- SETTINGS ----------
const PREVIEW_MAX = 800;
const EDGE_SOFTNESS = 8;
const SPILL_REMOVAL = 0.6;

// ---------- STATE ----------
let fgImage = new Image();
let bgImage = new Image();
let fgLoaded = false;
let bgLoaded = false;

let fgX = 0, fgY = 0, fgScale = 1, fgRotation = 0;
let previewScale = 1;

// ---------- MANUAL BRUSH ----------
let brushEnabled = false;
let brushMode = "restore";
let brushSize = 30;
let painting = false;

let maskCanvas = document.createElement("canvas");
let maskCtx = maskCanvas.getContext("2d");

// ---------- LOAD IMAGES ----------
fgInput.onchange = e => {
  fgImage.src = URL.createObjectURL(e.target.files[0]);
  fgImage.onload = () => {
    fgLoaded = true;
    maskCanvas.width = fgImage.width;
    maskCanvas.height = fgImage.height;
    maskCtx.fillStyle = "white";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    draw();
  };
};

bgInput.onchange = e => {
  bgImage.src = URL.createObjectURL(e.target.files[0]);
  bgImage.onload = () => {
    bgLoaded = true;
    fgX = bgImage.width / 2;
    fgY = bgImage.height / 2;
    draw();
  };
};

// ---------- UI ----------
toggleBrushBtn.onclick = () => {
  brushEnabled = !brushEnabled;
  canvas.style.cursor = brushEnabled ? "crosshair" : "default";
};

brushModeSelect.onchange = e => brushMode = e.target.value;
brushSizeSlider.oninput = e => brushSize = +e.target.value;

[posX, posY, scaleSlider, rotateSlider].forEach(sl => {
  sl.oninput = () => {
    fgX = bgImage.width * posX.value / 100;
    fgY = bgImage.height * posY.value / 100;
    fgScale = scaleSlider.value / 100;
    fgRotation = rotateSlider.value * Math.PI / 180;
    draw();
  };
});

// ---------- PAINT MASK ----------
canvas.onmousedown = e => { if (brushEnabled) { painting = true; paint(e); }};
canvas.onmousemove = e => painting && brushEnabled && paint(e);
canvas.onmouseup = () => painting = false;

function paint(e) {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / previewScale - fgX) / fgScale + fgImage.width / 2;
  const y = ((e.clientY - r.top) / previewScale - fgY) / fgScale + fgImage.height / 2;

  maskCtx.globalCompositeOperation =
    brushMode === "restore" ? "source-over" : "destination-out";

  maskCtx.beginPath();
  maskCtx.arc(x, y, brushSize / fgScale, 0, Math.PI * 2);
  maskCtx.fillStyle = "rgba(0,0,0,0.8)";
  maskCtx.fill();

  draw();
}

// ---------- DRAW ----------
function draw() {
  if (!bgLoaded) return;

  previewScale = Math.min(PREVIEW_MAX / bgImage.width, 1);
  canvas.width = bgImage.width * previewScale;
  canvas.height = bgImage.height * previewScale;

  ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  if (!fgLoaded) return;

  const off = document.createElement("canvas");
  off.width = fgImage.width;
  off.height = fgImage.height;
  const o = off.getContext("2d");
  o.drawImage(fgImage, 0, 0);

  let img = o.getImageData(0, 0, off.width, off.height);
  let d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const diff = g - Math.max(r, b);
    if (diff > 0) {
      d[i + 3] = 255 - Math.min(255, diff * EDGE_SOFTNESS);
      d[i] += (g - r) * SPILL_REMOVAL;
      d[i + 2] += (g - b) * SPILL_REMOVAL;
    }
  }
  o.putImageData(img, 0, 0);

  o.globalCompositeOperation = "destination-in";
  o.drawImage(maskCanvas, 0, 0);

  ctx.save();
  ctx.translate(fgX * previewScale, fgY * previewScale);
  ctx.rotate(fgRotation);
  ctx.scale(fgScale * previewScale, fgScale * previewScale);
  ctx.drawImage(off, -fgImage.width / 2, -fgImage.height / 2);
  ctx.restore();
}

// ---------- DOWNLOAD ----------
downloadBtn.onclick = () => {
  if (!bgLoaded || !fgLoaded) {
    alert("Please load both foreground and background images before downloading.");
    return;
  }

  // Create the output canvas
  const outCanvas = document.createElement("canvas");
  outCanvas.width = bgImage.width;
  outCanvas.height = bgImage.height;
  const outCtx = outCanvas.getContext("2d");

  // Draw the background image
  outCtx.drawImage(bgImage, 0, 0);

  // Prepare the refined foreground image
  const refinedCanvas = createRefinedCanvas();

  // Transform and draw the refined foreground onto the output canvas
  outCtx.save();
  outCtx.translate(fgX, fgY);
  outCtx.rotate(fgRotation);
  outCtx.scale(fgScale, fgScale);
  outCtx.drawImage(refinedCanvas, -fgImage.width / 2, -fgImage.height / 2);
  outCtx.restore();

  // Trigger the download
  triggerDownload(outCanvas, "green_screen_result.png");
};

// ---------- HELPER FUNCTIONS ----------
/**
 * Creates a refined version of the foreground image with the mask applied.
 * @returns {HTMLCanvasElement} The refined canvas.
 */
function createRefinedCanvas() {
  const refinedCanvas = document.createElement("canvas");
  refinedCanvas.width = fgImage.width;
  refinedCanvas.height = fgImage.height;
  const refinedCtx = refinedCanvas.getContext("2d");

  // Draw the foreground image
  refinedCtx.drawImage(fgImage, 0, 0);

  // Apply the mask
  refinedCtx.globalCompositeOperation = "destination-in";
  refinedCtx.drawImage(maskCanvas, 0, 0);

  return refinedCanvas;
}

/**
 * Triggers a download of the given canvas as a PNG file.
 * @param {HTMLCanvasElement} canvas - The canvas to download.
 * @param {string} filename - The name of the downloaded file.
 */
function triggerDownload(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
