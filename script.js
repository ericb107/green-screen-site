// ================== DOM ==================
const fgInput = document.getElementById("foregroundInput");
const bgInput = document.getElementById("backgroundInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const downloadBtn = document.getElementById("downloadBtn");

const posXSlider = document.getElementById("posX");
const posYSlider = document.getElementById("posY");
const scaleSlider = document.getElementById("scale");
const rotateSlider = document.getElementById("rotate");

const toggleBrushBtn = document.getElementById("toggleBrush");
const brushModeSelect = document.getElementById("brushMode");
const brushSizeSlider = document.getElementById("brushSize");

// ================== SETTINGS ==================
const PREVIEW_MAX_WIDTH = 800;
const PREVIEW_MAX_HEIGHT = 600;
const EDGE_SOFTNESS = 8;
const SPILL_REMOVAL = 0.6;

// ================== IMAGES ==================
let fgImage = new Image();
let bgImage = new Image();
let fgLoaded = false;
let bgLoaded = false;

// ================== TRANSFORM ==================
let fgX = 0;
let fgY = 0;
let fgScale = 1;
let fgRotation = 0;
let previewScale = 1;

// ================== INPUT STATES ==================
let isDragging = false;
let isRotating = false;
let lastMouseX = 0;
let lastMouseY = 0;

// ================== TOUCH ==================
let lastTouchDistance = null;
let lastTouchAngle = null;

// ================== BRUSH ==================
let brushEnabled = false;
let brushMode = "restore";
let brushSize = 30;
let isPainting = false;

// Mask canvas
let maskCanvas = document.createElement("canvas");
let maskCtx = maskCanvas.getContext("2d");

// ================== LOAD IMAGES ==================
fgInput.onchange = e => {
    fgImage = new Image();
    fgImage.src = URL.createObjectURL(e.target.files[0]);
    fgImage.onload = () => {
        fgLoaded = true;
        maskCanvas.width = fgImage.width;
        maskCanvas.height = fgImage.height;
        maskCtx.fillStyle = "white";
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        drawCanvas();
    };
};

bgInput.onchange = e => {
    bgImage = new Image();
    bgImage.src = URL.createObjectURL(e.target.files[0]);
    bgImage.onload = () => {
        bgLoaded = true;
        fgX = bgImage.width / 2;
        fgY = bgImage.height / 2;
        drawCanvas();
    };
};

// ================== SLIDERS ==================
posXSlider.oninput = () => {
    fgX = (posXSlider.value / 100) * bgImage.width;
    drawCanvas();
};
posYSlider.oninput = () => {
    fgY = (posYSlider.value / 100) * bgImage.height;
    drawCanvas();
};
scaleSlider.oninput = () => {
    fgScale = scaleSlider.value / 100;
    drawCanvas();
};
rotateSlider.oninput = () => {
    fgRotation = rotateSlider.value * Math.PI / 180;
    drawCanvas();
};

// ================== BRUSH UI ==================
toggleBrushBtn.onclick = () => {
    brushEnabled = !brushEnabled;
    canvas.style.cursor = brushEnabled ? "crosshair" : "grab";
};

brushModeSelect.onchange = e => brushMode = e.target.value;
brushSizeSlider.oninput = e => brushSize = parseInt(e.target.value);

// ================== MOUSE ==================
canvas.addEventListener("mousedown", e => {
    if (brushEnabled) {
        isPainting = true;
        paintMask(e);
        return;
    }

    const r = canvas.getBoundingClientRect();
    lastMouseX = (e.clientX - r.left) / previewScale;
    lastMouseY = (e.clientY - r.top) / previewScale;
    isRotating = e.shiftKey;
    isDragging = !e.shiftKey;
});

canvas.addEventListener("mousemove", e => {
    if (brushEnabled && isPainting) {
        paintMask(e);
        return;
    }

    if (!isDragging && !isRotating) return;

    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / previewScale;
    const y = (e.clientY - r.top) / previewScale;

    if (isDragging) {
        fgX += x - lastMouseX;
        fgY += y - lastMouseY;
    }
    if (isRotating) {
        fgRotation += (x - lastMouseX) * 0.01;
    }

    lastMouseX = x;
    lastMouseY = y;
    syncSliders();
    drawCanvas();
});

canvas.addEventListener("mouseup", resetStates);
canvas.addEventListener("mouseleave", resetStates);

canvas.addEventListener("wheel", e => {
    if (brushEnabled) return;
    e.preventDefault();
    fgScale = Math.max(0.1, fgScale + e.deltaY * -0.001);
    syncSliders();
    drawCanvas();
});

// ================== TOUCH ==================
canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    if (brushEnabled) {
        isPainting = true;
        paintMask(e.touches[0]);
        return;
    }
    if (e.touches.length === 2) {
        lastTouchDistance = getTouchDistance(e);
        lastTouchAngle = getTouchAngle(e);
    }
});

canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    if (brushEnabled && isPainting) {
        paintMask(e.touches[0]);
        return;
    }

    if (e.touches.length === 1) {
        const r = canvas.getBoundingClientRect();
        fgX = (e.touches[0].clientX - r.left) / previewScale;
        fgY = (e.touches[0].clientY - r.top) / previewScale;
    }
    if (e.touches.length === 2) {
        const d = getTouchDistance(e);
        const a = getTouchAngle(e);
        fgScale *= d / lastTouchDistance;
        fgRotation += a - lastTouchAngle;
        lastTouchDistance = d;
        lastTouchAngle = a;
    }

    syncSliders();
    drawCanvas();
});

canvas.addEventListener("touchend", resetStates);

// ================== DRAW ==================
function drawCanvas() {
    if (!bgLoaded) return;

    previewScale = Math.min(
        PREVIEW_MAX_WIDTH / bgImage.width,
        PREVIEW_MAX_HEIGHT / bgImage.height,
        1
    );

    canvas.width = bgImage.width * previewScale;
    canvas.height = bgImage.height * previewScale;
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

    if (!fgLoaded) return;

    const off = document.createElement("canvas");
    off.width = fgImage.width;
    off.height = fgImage.height;
    const octx = off.getContext("2d");
    octx.drawImage(fgImage, 0, 0);

    let img = octx.getImageData(0, 0, off.width, off.height);
    let d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        const diff = d[i + 1] - Math.max(d[i], d[i + 2]);
        if (diff > 0) {
            d[i + 3] = 255 - Math.min(255, diff * EDGE_SOFTNESS);
            d[i] += (d[i + 1] - d[i]) * SPILL_REMOVAL;
            d[i + 2] += (d[i + 1] - d[i + 2]) * SPILL_REMOVAL;
        }
    }
    octx.putImageData(img, 0, 0);

    octx.globalCompositeOperation = "destination-in";
    octx.drawImage(maskCanvas, 0, 0);
    octx.globalCompositeOperation = "source-over";

    const w = fgImage.width * fgScale * previewScale;
    const h = w / (fgImage.width / fgImage.height);

    ctx.save();
    ctx.translate(fgX * previewScale, fgY * previewScale);
    ctx.rotate(fgRotation);
    ctx.drawImage(off, -w / 2, -h / 2, w, h);
    ctx.restore();
}

// ================== DOWNLOAD ==================
downloadBtn.onclick = () => {
    const out = document.createElement("canvas");
    out.width = bgImage.width;
    out.height = bgImage.height;
    const octx = out.getContext("2d");

    octx.drawImage(bgImage, 0, 0);

    const refined = document.createElement("canvas");
    refined.width = fgImage.width;
    refined.height = fgImage.height;
    const rctx = refined.getContext("2d");
    rctx.drawImage(fgImage, 0, 0);

    let data = rctx.getImageData(0, 0, refined.width, refined.height);
    let px = data.data;

    for (let i = 0; i < px.length; i += 4) {
        const diff = px[i + 1] - Math.max(px[i], px[i + 2]);
        if (diff > 0) px[i + 3] = 255 - Math.min(255, diff * EDGE_SOFTNESS);
    }
    rctx.putImageData(data, 0, 0);

    rctx.globalCompositeOperation = "destination-in";
    rctx.drawImage(maskCanvas, 0, 0);
    rctx.globalCompositeOperation = "source-over";

    octx.save();
    octx.translate(fgX, fgY);
    octx.rotate(fgRotation);
    octx.scale(fgScale, fgScale);
    octx.drawImage(refined, -fgImage.width / 2, -fgImage.height / 2);
    octx.restore();

    const a = document.createElement("a");
    a.download = "green_screen_result.png";
    a.href = out.toDataURL("image/png");
    a.click();
};

// ================== HELPERS ==================
function paintMask(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / previewScale - fgX) / fgScale + fgImage.width / 2;
    const y = ((e.clientY - r.top) / previewScale - fgY) / fgScale + fgImage.height / 2;
    if (x < 0 || y < 0 || x > fgImage.width || y > fgImage.height) return;

    maskCtx.globalCompositeOperation =
        brushMode === "restore" ? "source-over" : "destination-out";

    maskCtx.beginPath();
    maskCtx.arc(x, y, brushSize / fgScale, 0, Math.PI * 2);
    maskCtx.fill();
    drawCanvas();
}

function resetStates() {
    isDragging = false;
    isRotating = false;
    isPainting = false;
}

function syncSliders() {
    posXSlider.value = (fgX / bgImage.width) * 100;
    posYSlider.value = (fgY / bgImage.height) * 100;
    scaleSlider.value = fgScale * 100;
    rotateSlider.value = fgRotation * 180 / Math.PI;
}

function getTouchDistance(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.hypot(dx, dy);
}

function getTouchAngle(e) {
    return Math.atan2(
        e.touches[1].clientY - e.touches[0].clientY,
        e.touches[1].clientX - e.touches[0].clientX
    );
}
