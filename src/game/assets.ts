import {
  BOOK_X,
  BOOK_Y,
  BRIDGE_END_X,
  BRIDGE_START_X,
  GATE_X,
  GATE_Y,
  LEFT_TREE_X,
  LEFT_TREE_Y,
  RIGHT_TREE_X,
  RIGHT_TREE_Y,
  ROAD_MAX_Y,
  ROAD_MIN_Y,
  STATUE_X,
  STATUE_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './rules';

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameAssets {
  panorama: HTMLCanvasElement;
  rexFrames: HTMLCanvasElement[]; // 0: idle, 1: walk, 2: kick, 3: tailwhip (cleaned sclera for live eye tracking)
  rexEyeCenters: Array<{
    big: { cx: number; cy: number; rx: number; ry: number };
    small: { cx: number; cy: number; rx: number; ry: number };
  }>;
  palmLeft: HTMLCanvasElement;
  palmRight: HTMLCanvasElement;
  stoneGate: HTMLCanvasElement;
  dinoStatue: HTMLCanvasElement;
  eggshell: HTMLCanvasElement;
  keyItem: HTMLCanvasElement;
  bulbItem: HTMLCanvasElement;
  oldBook: HTMLCanvasElement;
  dvdItem: HTMLCanvasElement;
  backpackIcon: HTMLCanvasElement;
  pterodactylFlap: HTMLCanvasElement[];
  pterodactylSilhouettes: HTMLCanvasElement[];
  clouds: HTMLCanvasElement[];
  smokeWisps: HTMLCanvasElement[];
}

function resolveAssetUrl(src: string): string {
  if (typeof window !== 'undefined') {
    const inlineMap = (window as unknown as { __INLINE_ASSETS__?: Record<string, string> }).__INLINE_ASSETS__;
    if (inlineMap) {
      const normalized = src.replace(/^\.\//, '/');
      const relative = normalized.startsWith('/') ? `.${normalized}` : normalized;
      if (inlineMap[src]) return inlineMap[src];
      if (inlineMap[relative]) return inlineMap[relative];
      if (inlineMap[normalized]) return inlineMap[normalized];
    }
  }
  return src;
}

function loadImageSafe(src: string, timeoutMs = 4500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      finish(null);
    }, timeoutMs);

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    };
    img.onerror = () => {
      finish(null);
    };
    img.src = resolveAssetUrl(src);
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function isNearWhitePixel(r: number, g: number, b: number, threshold = 226): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= threshold && max - min <= 22;
}

/**
 * Un-blends white-background anti-aliasing fringe on pixels bordering transparency
 * so ink outlines remain crisp with zero pale halo against sage/olive backgrounds.
 */
function decontaminateSpriteEdges(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  darkInkEdge = true
): void {
  const borderMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (data[idx * 4 + 3] === 0) continue;
      const tLeft = x === 0 || data[(idx - 1) * 4 + 3] === 0;
      const tRight = x === w - 1 || data[(idx + 1) * 4 + 3] === 0;
      const tUp = y === 0 || data[(idx - w) * 4 + 3] === 0;
      const tDown = y === h - 1 || data[(idx + w) * 4 + 3] === 0;
      if (tLeft || tRight || tUp || tDown) {
        borderMask[idx] = 1;
      }
    }
  }

  const lumCutoff = darkInkEdge ? 148 : 198;
  const whiteCutoff = darkInkEdge ? 222 : 230;

  for (let idx = 0; idx < w * h; idx++) {
    if (!borderMask[idx]) continue;
    const p = idx * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = (r + g + b) / 3;
    const chroma = max - min;

    if (lum > lumCutoff && chroma < 28) {
      if (lum >= whiteCutoff) {
        data[p + 3] = 0;
      } else {
        const t = (whiteCutoff - lum) / (whiteCutoff - lumCutoff);
        data[p + 3] = Math.round(data[p + 3] * t);
        if (darkInkEdge) {
          const inkFactor = 0.56;
          data[p] = Math.round(r * inkFactor);
          data[p + 1] = Math.round(g * inkFactor);
          data[p + 2] = Math.round(b * inkFactor);
        }
      }
    }
  }
}

interface ExtractOptions {
  whiteThreshold?: number;
  clearInteriorWhite?: boolean;
  seed?: { x: number; y: number };
  darkInkEdge?: boolean;
}

/**
 * Extracts a sprite sub-rectangle and removes the solid white outer background
 * using flood-fill, optional interior white pocket cleanup, optional single-component
 * isolation (preventing overlapping neighboring sprites or stray artifacts),
 * and two-pass edge halo decontamination.
 */
function extractCleanSprite(
  source: HTMLImageElement,
  rect: SpriteRect,
  options: ExtractOptions = {}
): HTMLCanvasElement {
  const {
    whiteThreshold = 228,
    clearInteriorWhite = false,
    seed,
    darkInkEdge = true,
  } = options;

  const canvas = makeCanvas(rect.w, rect.h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  const imgData = ctx.getImageData(0, 0, rect.w, rect.h);
  const data = imgData.data;
  const w = rect.w;
  const h = rect.h;

  // Step 1: Flood-fill outer near-white background from all 4 borders
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const enqueue = (idx: number) => {
    if (visited[idx]) return;
    const p = idx * 4;
    if (isNearWhitePixel(data[p], data[p + 1], data[p + 2], whiteThreshold)) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueue(x);
    enqueue((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueue(y * w);
    enqueue(y * w + (w - 1));
  }

  while (head < tail) {
    const cur = queue[head++];
    data[cur * 4 + 3] = 0;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    if (cx > 0) enqueue(cur - 1);
    if (cx < w - 1) enqueue(cur + 1);
    if (cy > 0) enqueue(cur - w);
    if (cy < h - 1) enqueue(cur + w);
  }

  // Step 2: Optionally isolate ONLY the single connected component containing `seed`
  if (seed) {
    const keep = new Uint8Array(w * h);
    const fgQueue = new Int32Array(w * h);
    let fgHead = 0;
    let fgTail = 0;
    const startIdx = seed.y * w + seed.x;
    if (startIdx >= 0 && startIdx < w * h && data[startIdx * 4 + 3] > 0) {
      keep[startIdx] = 1;
      fgQueue[fgTail++] = startIdx;
    }
    while (fgHead < fgTail) {
      const cur = fgQueue[fgHead++];
      const cx = cur % w;
      const cy = (cur / w) | 0;
      const nLeft = cx > 0 ? cur - 1 : -1;
      const nRight = cx < w - 1 ? cur + 1 : -1;
      const nUp = cy > 0 ? cur - w : -1;
      const nDown = cy < h - 1 ? cur + w : -1;
      for (const n of [nLeft, nRight, nUp, nDown]) {
        if (n >= 0 && !keep[n] && data[n * 4 + 3] > 0) {
          keep[n] = 1;
          fgQueue[fgTail++] = n;
        }
      }
    }
    for (let idx = 0; idx < w * h; idx++) {
      if (!keep[idx]) {
        data[idx * 4 + 3] = 0;
      }
    }
  }

  // Step 3: Remove enclosed pure white pockets (Key bow ring, Palm frond gaps, Stone Gate arches)
  if (clearInteriorWhite) {
    for (let idx = 0; idx < w * h; idx++) {
      const p = idx * 4;
      if (data[p + 3] === 0) continue;
      if (isNearWhitePixel(data[p], data[p + 1], data[p + 2], 232)) {
        data[p + 3] = 0;
      }
    }
  }

  // Step 4: Two passes of edge halo decontamination remove 1px and 2px white AA fringes
  decontaminateSpriteEdges(data, w, h, darkInkEdge);
  decontaminateSpriteEdges(data, w, h, darkInkEdge);

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Prepares clean sclera for Meziu Rex's two asymmetrical eyes so live pupils & blinking
 * can track dynamically without showing a second static pupil underneath.
 */
function cleanRexEyeSclera(
  frameCanvas: HTMLCanvasElement,
  big: { cx: number; cy: number; rx: number; ry: number },
  small: { cx: number; cy: number; rx: number; ry: number }
): HTMLCanvasElement {
  const copy = makeCanvas(frameCanvas.width, frameCanvas.height);
  const ctx = copy.getContext('2d')!;
  ctx.drawImage(frameCanvas, 0, 0);

  // Fill interior sclera cleanly with warm off-white matching the artwork's eye shading
  ctx.save();
  ctx.fillStyle = '#e7eadf';
  ctx.beginPath();
  ctx.ellipse(big.cx, big.cy, big.rx, big.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d4dacb';
  ctx.beginPath();
  ctx.ellipse(small.cx, small.cy, small.rx, small.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return copy;
}

/**
 * Builds a seamless 2330x698 panoramic background from the left and right reference scenes,
 * removing the Gemini 4-point star watermarks, static hanging items on the left palm tree,
 * and the static left eggshell so interactive world props animate cleanly without ghosting.
 */
function buildSeamlessPanorama(leftImg: HTMLImageElement, rightImg: HTMLImageElement): HTMLCanvasElement {
  const canvas = makeCanvas(WORLD_WIDTH, WORLD_HEIGHT);
  const ctx = canvas.getContext('2d')!;

  // 1. Draw left world cliff & ruined satellite dishes
  ctx.drawImage(leftImg, 0, 0, 1280, 698);

  // 2. Clone-stamp textured dark mossy rock over static left eggshell (x: 0..145, y: 425..535)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(64, 488, 76, 54, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(leftImg, 4, 325, 148, 108, -8, 434, 152, 112);
  ctx.restore();

  // Clone-stamp textured grass over tiny shell crumbs (x: 132..372, y: 532..574)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(252, 554, 122, 22, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(leftImg, 375, 532, 240, 44, 130, 532, 244, 44);
  ctx.restore();

  // 3. Softly remove the tiny left-canopy shake ticks (x: 758..788, y: 160..215) &
  // feathered elliptical sky patch over the static hanging key/bulb area (strictly below canopy y >= 218)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(772, 188, 16, 26, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(leftImg, 695, 160, 34, 56, 755, 160, 34, 56);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(925, 305, 86, 86, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(leftImg, 635, 218, 175, 175, 838, 218, 175, 175);
  ctx.restore();

  // 4. Prepare rightLayer (96ebf6d7.png scaled cleanly to WORLD_HEIGHT = 698)
  // At rightX = 691, the left palm trunk aligns to within 0.3px of leftImg's trunk at worldX = 771.
  const scale = WORLD_HEIGHT / rightImg.height;
  const rightDrawW = Math.round(rightImg.width * scale);
  const rightX = 691;

  const rightLayer = makeCanvas(rightDrawW, WORLD_HEIGHT);
  const rCtx = rightLayer.getContext('2d')!;
  rCtx.drawImage(rightImg, 0, 0, rightDrawW, WORLD_HEIGHT);

  // Remove Gemini 4-point star watermark in bottom-right of rightLayer (patch from adjacent dark bush)
  rCtx.save();
  rCtx.beginPath();
  rCtx.arc(rightDrawW - 58, WORLD_HEIGHT - 54, 46, 0, Math.PI * 2);
  rCtx.clip();
  rCtx.drawImage(
    rightLayer,
    rightDrawW - 165,
    WORLD_HEIGHT - 102,
    92,
    92,
    rightDrawW - 104,
    WORLD_HEIGHT - 100,
    92,
    92
  );
  rCtx.restore();

  // Smooth horizontal crossfade from rightLayer x = 95..295 (worldX = 786..986)
  // keeping left open sky pure and seamlessly blending across the palm trunk into the bridge.
  const maskCanvas = makeCanvas(rightDrawW, WORLD_HEIGHT);
  const mCtx = maskCanvas.getContext('2d')!;
  const seamStart = 95;
  const seamEnd = 295;
  const seamGrad = mCtx.createLinearGradient(seamStart, 0, seamEnd, 0);
  seamGrad.addColorStop(0, 'rgba(0,0,0,0)');
  seamGrad.addColorStop(1, 'rgba(0,0,0,1)');
  mCtx.fillStyle = seamGrad;
  mCtx.fillRect(seamStart, 0, seamEnd - seamStart, WORLD_HEIGHT);
  mCtx.fillStyle = '#000';
  mCtx.fillRect(seamEnd, 0, rightDrawW - seamEnd, WORLD_HEIGHT);

  rCtx.globalCompositeOperation = 'destination-in';
  rCtx.drawImage(maskCanvas, 0, 0);
  rCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(rightLayer, rightX, 0);

  return canvas;
}

const DEFAULT_REX_EYE_CENTERS: GameAssets['rexEyeCenters'] = [
  { big: { cx: 100.5, cy: 24, rx: 7.5, ry: 8.5 }, small: { cx: 141, cy: 20, rx: 4.5, ry: 5.2 } },
  { big: { cx: 101, cy: 24, rx: 7.5, ry: 8.5 }, small: { cx: 141.5, cy: 20, rx: 4.5, ry: 5.2 } },
  { big: { cx: 94.5, cy: 23.8, rx: 7.5, ry: 8.5 }, small: { cx: 135.5, cy: 19.5, rx: 4.5, ry: 5.2 } },
  { big: { cx: 96.8, cy: 23.8, rx: 7.5, ry: 8.5 }, small: { cx: 137.5, cy: 19.8, rx: 4.5, ry: 5.2 } },
];

function drawProceduralPalm(w: number, h: number, leanRight: boolean): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const baseX = leanRight ? w * 0.34 : w * 0.42;
  const topX = leanRight ? w * 0.56 : w * 0.62;
  const topY = h * 0.24;

  // Trunk
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(baseX, h - 10);
  ctx.quadraticCurveTo(baseX + 18, h * 0.58, topX, topY);
  ctx.stroke();

  ctx.strokeStyle = '#5c4b37';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(baseX, h - 10);
  ctx.quadraticCurveTo(baseX + 18, h * 0.58, topX, topY);
  ctx.stroke();

  // Fronds
  const angles = [-2.6, -2.0, -1.35, -0.55, 0.12, 0.65, 2.75];
  for (const ang of angles) {
    ctx.save();
    ctx.translate(topX, topY);
    ctx.rotate(ang);
    ctx.fillStyle = '#4c6234';
    ctx.strokeStyle = '#1b2019';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(56, -26, 118, 6);
    ctx.quadraticCurveTo(64, 14, 0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  return c;
}

function drawProceduralStoneGate(): HTMLCanvasElement {
  const c = makeCanvas(312, 381);
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 4;

  // Pillars & arch
  ctx.fillStyle = '#6f7465';
  ctx.beginPath();
  ctx.roundRect(24, 130, 56, 240, 6);
  ctx.roundRect(232, 130, 56, 240, 6);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(156, 152, 116, Math.PI, 0);
  ctx.lineWidth = 36;
  ctx.strokeStyle = '#1b2019';
  ctx.stroke();
  ctx.lineWidth = 28;
  ctx.strokeStyle = '#7b8070';
  ctx.stroke();

  // Wooden door panels
  ctx.fillStyle = '#5b4b3a';
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(78, 128, 156, 240, [74, 74, 4, 4]);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(156, 128);
  ctx.lineTo(156, 368);
  ctx.stroke();

  // Lock
  ctx.fillStyle = '#9aa18f';
  ctx.beginPath();
  ctx.roundRect(142, 236, 28, 34, 6);
  ctx.fill();
  ctx.stroke();
  return c;
}

function drawProceduralStatue(): HTMLCanvasElement {
  const c = makeCanvas(127, 171);
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#7a8072';
  ctx.beginPath();
  ctx.ellipse(64, 150, 44, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(64, 102, 26, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(38, 28, 56, 42, 16);
  ctx.fill();
  ctx.stroke();
  return c;
}

function drawProceduralEggshell(): HTMLCanvasElement {
  const c = makeCanvas(108, 94);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d7ceb2';
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(14, 42);
  ctx.lineTo(28, 26);
  ctx.lineTo(44, 40);
  ctx.lineTo(60, 22);
  ctx.lineTo(76, 38);
  ctx.lineTo(94, 28);
  ctx.quadraticCurveTo(98, 84, 54, 86);
  ctx.quadraticCurveTo(10, 84, 14, 42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return c;
}

function drawProceduralKey(): HTMLCanvasElement {
  const c = makeCanvas(91, 74);
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#1b2019';
  ctx.fillStyle = '#e5c158';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(68, 28, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(14, 24, 44, 10, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(18, 34, 8, 12);
  ctx.strokeRect(18, 34, 8, 12);
  return c;
}

function drawProceduralBulb(): HTMLCanvasElement {
  const c = makeCanvas(56, 68);
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 2.5;
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(28, 26, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6e756a';
  ctx.beginPath();
  ctx.roundRect(20, 42, 16, 14, 3);
  ctx.fill();
  ctx.stroke();
  return c;
}

function drawProceduralBook(): HTMLCanvasElement {
  const c = makeCanvas(148, 106);
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#734232';
  ctx.beginPath();
  ctx.roundRect(24, 34, 98, 52, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ded4b6';
  ctx.fillRect(32, 42, 82, 10);
  return c;
}

function drawProceduralDvd(): HTMLCanvasElement {
  const c = makeCanvas(95, 95);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#cfd8dc';
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(47.5, 47.5, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5f6a5c';
  ctx.beginPath();
  ctx.arc(47.5, 47.5, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  return c;
}

function drawProceduralBackpack(): HTMLCanvasElement {
  const c = makeCanvas(98, 109);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5f5b49';
  ctx.strokeStyle = '#1b2019';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(18, 22, 62, 72, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#474437';
  ctx.beginPath();
  ctx.roundRect(24, 26, 50, 30, 10);
  ctx.fill();
  ctx.stroke();
  return c;
}

function createFallbackRexFrames(): HTMLCanvasElement[] {
  return DEFAULT_REX_EYE_CENTERS.map((eyeCfg, idx) => {
    const c = makeCanvas(165, 176);
    const ctx = c.getContext('2d')!;
    const headDx = eyeCfg.big.cx - 100.5;
    const kickLift = idx === 2 ? -22 : 0;
    const walkShift = idx === 1 ? 8 : 0;
    const tailWhipLift = idx === 3 ? -26 : 0;

    ctx.strokeStyle = '#1b2019';
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Tail
    ctx.fillStyle = '#627149';
    ctx.beginPath();
    ctx.moveTo(58, 114);
    ctx.quadraticCurveTo(22, 118 + tailWhipLift * 0.5, 10, 86 + tailWhipLift);
    ctx.quadraticCurveTo(32, 98 + tailWhipLift * 0.3, 62, 96);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Back leg
    ctx.fillStyle = '#52603d';
    ctx.beginPath();
    ctx.roundRect(62 - walkShift * 0.5, 128, 16, 36, 7);
    ctx.fill();
    ctx.stroke();

    // Torso
    ctx.fillStyle = '#6a7a50';
    ctx.beginPath();
    ctx.ellipse(84, 104, 28, 34, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly highlight
    ctx.fillStyle = '#89986d';
    ctx.beginPath();
    ctx.ellipse(94, 108, 14, 24, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Front leg
    ctx.fillStyle = '#6a7a50';
    ctx.save();
    ctx.translate(92 + walkShift * 0.6, 128);
    if (kickLift !== 0) ctx.rotate(-0.75);
    ctx.beginPath();
    ctx.roundRect(-8, 0, 17, 36, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Tiny T-Rex arm
    ctx.beginPath();
    ctx.moveTo(106, 86);
    ctx.lineTo(120, 92);
    ctx.lineTo(116, 98);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#6a7a50';
    ctx.beginPath();
    ctx.roundRect(74 + headDx, 16, 76, 54, 20);
    ctx.fill();
    ctx.stroke();

    // Snout teeth
    ctx.fillStyle = '#f1f0e2';
    ctx.beginPath();
    ctx.moveTo(132 + headDx, 56);
    ctx.lineTo(136 + headDx, 63);
    ctx.lineTo(140 + headDx, 56);
    ctx.fill();

    // Eye sockets outline
    ctx.strokeStyle = '#1b2019';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(eyeCfg.big.cx, eyeCfg.big.cy, eyeCfg.big.rx + 1.5, eyeCfg.big.ry + 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(eyeCfg.small.cx, eyeCfg.small.cy, eyeCfg.small.rx + 1.2, eyeCfg.small.ry + 1.2, 0, 0, Math.PI * 2);
    ctx.stroke();

    return cleanRexEyeSclera(c, eyeCfg.big, eyeCfg.small);
  });
}

function createFallbackSkyAssets(): Pick<
  GameAssets,
  'pterodactylFlap' | 'pterodactylSilhouettes' | 'clouds' | 'smokeWisps'
> {
  const makePtero = (wingOffset: number, silhouette: boolean): HTMLCanvasElement => {
    const c = makeCanvas(164, 108);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = silhouette ? '#2b3228' : '#6c725c';
    ctx.strokeStyle = silhouette ? '#2b3228' : '#1b2019';
    ctx.lineWidth = 2.5;

    // Wing
    ctx.beginPath();
    ctx.moveTo(76, 56);
    ctx.quadraticCurveTo(44, 16 + wingOffset, 16, 28 + wingOffset);
    ctx.quadraticCurveTo(48, 52 + wingOffset * 0.4, 72, 64);
    ctx.closePath();
    ctx.fill();
    if (!silhouette) ctx.stroke();

    // Body + beak
    ctx.beginPath();
    ctx.ellipse(84, 62, 24, 10, 0.1, 0, Math.PI * 2);
    ctx.fill();
    if (!silhouette) ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(100, 56);
    ctx.lineTo(144, 68);
    ctx.lineTo(102, 68);
    ctx.closePath();
    ctx.fill();
    if (!silhouette) ctx.stroke();
    return c;
  };

  const makeCloud = (w: number, h: number, smoke = false): HTMLCanvasElement => {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = smoke ? 'rgba(148, 158, 140, 0.45)' : 'rgba(182, 191, 174, 0.65)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.58, w * 0.36, h * 0.28, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.34, h * 0.52, w * 0.22, h * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.66, h * 0.52, w * 0.22, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    return c;
  };

  return {
    pterodactylFlap: [-14, -4, 12, 2, -10, 8].map((off) => makePtero(off, false)),
    pterodactylSilhouettes: [-10, 4, 14].map((off) => makePtero(off, true)),
    clouds: [
      makeCloud(320, 110),
      makeCloud(270, 100),
      makeCloud(340, 120),
      makeCloud(250, 96),
      makeCloud(210, 84),
    ],
    smokeWisps: [makeCloud(190, 80, true), makeCloud(170, 74, true)],
  };
}

function createFallbackPanorama(
  leftImg?: HTMLImageElement | null,
  rightImg?: HTMLImageElement | null
): HTMLCanvasElement {
  const canvas = makeCanvas(WORLD_WIDTH, WORLD_HEIGHT);
  const ctx = canvas.getContext('2d')!;

  // Atmospheric gradient backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  skyGrad.addColorStop(0, '#727e6c');
  skyGrad.addColorStop(0.55, '#9ca894');
  skyGrad.addColorStop(1, '#4c5748');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Distant ruined towers
  ctx.fillStyle = '#626d5d';
  const towers = [190, 320, 470, 640, 1080, 1290, 1630, 1890, 2140];
  towers.forEach((tx, i) => {
    const tw = 64 + (i % 3) * 26;
    const th = 190 + (i % 4) * 58;
    ctx.fillRect(tx, 520 - th, tw, th);
  });

  // Left and right solid cliffs + ground road
  ctx.fillStyle = '#363f32';
  ctx.fillRect(0, ROAD_MIN_Y + 6, BRIDGE_START_X, WORLD_HEIGHT - ROAD_MIN_Y);
  ctx.fillRect(BRIDGE_END_X, ROAD_MIN_Y + 6, WORLD_WIDTH - BRIDGE_END_X, WORLD_HEIGHT - ROAD_MIN_Y);

  // Road top moss/dirt surface
  ctx.fillStyle = '#5c664e';
  ctx.fillRect(0, ROAD_MIN_Y - 4, BRIDGE_START_X, ROAD_MAX_Y - ROAD_MIN_Y + 12);
  ctx.fillRect(BRIDGE_END_X, ROAD_MIN_Y - 4, WORLD_WIDTH - BRIDGE_END_X, ROAD_MAX_Y - ROAD_MIN_Y + 12);

  // Narrow wooden plank bridge across abyss
  ctx.fillStyle = '#4e4132';
  ctx.fillRect(BRIDGE_START_X, ROAD_MIN_Y + 8, BRIDGE_END_X - BRIDGE_START_X, 46);
  ctx.strokeStyle = '#242921';
  ctx.lineWidth = 2;
  for (let x = BRIDGE_START_X; x < BRIDGE_END_X; x += 28) {
    ctx.strokeRect(x, ROAD_MIN_Y + 8, 28, 46);
  }

  // Landmarks so world puzzle remains visually grounded
  const palmL = drawProceduralPalm(321, 412, true);
  const palmR = drawProceduralPalm(254, 367, false);
  const gate = drawProceduralStoneGate();
  const statue = drawProceduralStatue();
  const book = drawProceduralBook();

  ctx.drawImage(palmL, LEFT_TREE_X - 108, LEFT_TREE_Y - 392);
  ctx.drawImage(palmR, RIGHT_TREE_X - 140, RIGHT_TREE_Y - 352);
  ctx.drawImage(statue, STATUE_X - 58, STATUE_Y - 150);
  ctx.drawImage(book, BOOK_X - 74, BOOK_Y - 82);
  ctx.drawImage(gate, GATE_X - 96, GATE_Y - 344);

  // Overlay whichever real background artwork succeeded
  if (leftImg) {
    ctx.drawImage(leftImg, 0, 0, 1280, WORLD_HEIGHT);
  }
  if (rightImg) {
    const scale = WORLD_HEIGHT / rightImg.height;
    const rightDrawW = Math.round(rightImg.width * scale);
    ctx.drawImage(rightImg, 691, 0, rightDrawW, WORLD_HEIGHT);
  }

  return canvas;
}

export function createFallbackGameAssets(): GameAssets {
  const sky = createFallbackSkyAssets();
  return {
    panorama: createFallbackPanorama(null, null),
    rexFrames: createFallbackRexFrames(),
    rexEyeCenters: DEFAULT_REX_EYE_CENTERS,
    palmLeft: drawProceduralPalm(321, 412, true),
    palmRight: drawProceduralPalm(254, 367, false),
    stoneGate: drawProceduralStoneGate(),
    dinoStatue: drawProceduralStatue(),
    eggshell: drawProceduralEggshell(),
    keyItem: drawProceduralKey(),
    bulbItem: drawProceduralBulb(),
    oldBook: drawProceduralBook(),
    dvdItem: drawProceduralDvd(),
    backpackIcon: drawProceduralBackpack(),
    ...sky,
  };
}

let cachedAssetsPromise: Promise<GameAssets> | null = null;

export function loadGameAssets(): Promise<GameAssets> {
  if (cachedAssetsPromise) return cachedAssetsPromise;

  cachedAssetsPromise = (async () => {
    const [sheetProps, sheetSky, bgLeft, bgRight] = await Promise.all([
      loadImageSafe('./assets/aistudio/image_bfcdf26e.png'),
      loadImageSafe('./assets/aistudio/image_d81caafc.png'),
      loadImageSafe('./assets/aistudio/image_d53618c1.png'),
      loadImageSafe('./assets/aistudio/image_96ebf6d7.png'),
    ]);

    const panorama =
      bgLeft && bgRight
        ? buildSeamlessPanorama(bgLeft, bgRight)
        : createFallbackPanorama(bgLeft, bgRight);

    const rexEyeCenters = DEFAULT_REX_EYE_CENTERS;

    let rexFrames: HTMLCanvasElement[];
    let palmLeft: HTMLCanvasElement;
    let palmRight: HTMLCanvasElement;
    let stoneGate: HTMLCanvasElement;
    let dinoStatue: HTMLCanvasElement;
    let eggshell: HTMLCanvasElement;
    let keyItem: HTMLCanvasElement;
    let bulbItem: HTMLCanvasElement;
    let oldBook: HTMLCanvasElement;
    let dvdItem: HTMLCanvasElement;
    let backpackIcon: HTMLCanvasElement;

    if (sheetProps) {
      const rawRexRects: SpriteRect[] = [
        { x: 24, y: 69, w: 165, h: 176 },
        { x: 177, y: 68, w: 166, h: 176 },
        { x: 325, y: 66, w: 165, h: 179 },
        { x: 513, y: 68, w: 163, h: 176 },
      ];

      // Connected-component extraction removes adjacent overlapping snouts/tails on Frames 1-3
      // and removes broken disconnected tail motion-stroke fragments on Frame 4 (Tail Whip).
      rexFrames = rawRexRects.map((rect, idx) => {
        const raw = extractCleanSprite(sheetProps, rect, {
          seed: { x: 85, y: 110 },
          darkInkEdge: true,
        });
        return cleanRexEyeSclera(raw, rexEyeCenters[idx].big, rexEyeCenters[idx].small);
      });

      palmLeft = extractCleanSprite(sheetProps, { x: 686, y: 9, w: 321, h: 412 }, {
        seed: { x: 160, y: 150 },
        clearInteriorWhite: true,
      });
      palmRight = extractCleanSprite(sheetProps, { x: 1000, y: 25, w: 254, h: 367 }, {
        seed: { x: 150, y: 120 },
        clearInteriorWhite: true,
      });
      stoneGate = extractCleanSprite(sheetProps, { x: 35, y: 302, w: 312, h: 381 }, {
        clearInteriorWhite: true,
      });
      dinoStatue = extractCleanSprite(sheetProps, { x: 374, y: 345, w: 127, h: 171 }, {
        clearInteriorWhite: true,
      });
      eggshell = extractCleanSprite(sheetProps, { x: 530, y: 400, w: 108, h: 94 }, {
        clearInteriorWhite: false,
        darkInkEdge: false,
      });
      keyItem = extractCleanSprite(sheetProps, { x: 592, y: 469, w: 91, h: 74 }, {
        seed: { x: 56, y: 34 },
        clearInteriorWhite: true,
      });
      bulbItem = extractCleanSprite(sheetProps, { x: 515, y: 507, w: 56, h: 68 }, {
        clearInteriorWhite: false,
        darkInkEdge: false,
      });
      oldBook = extractCleanSprite(sheetProps, { x: 376, y: 558, w: 148, h: 106 }, {
        seed: { x: 60, y: 50 },
        clearInteriorWhite: true,
      });
      dvdItem = extractCleanSprite(sheetProps, { x: 560, y: 562, w: 95, h: 95 }, {
        clearInteriorWhite: false,
        darkInkEdge: false,
      });
      backpackIcon = extractCleanSprite(sheetProps, { x: 909, y: 408, w: 98, h: 109 }, {
        clearInteriorWhite: true,
      });
    } else {
      rexFrames = createFallbackRexFrames();
      palmLeft = drawProceduralPalm(321, 412, true);
      palmRight = drawProceduralPalm(254, 367, false);
      stoneGate = drawProceduralStoneGate();
      dinoStatue = drawProceduralStatue();
      eggshell = drawProceduralEggshell();
      keyItem = drawProceduralKey();
      bulbItem = drawProceduralBulb();
      oldBook = drawProceduralBook();
      dvdItem = drawProceduralDvd();
      backpackIcon = drawProceduralBackpack();
    }

    let pterodactylFlap: HTMLCanvasElement[];
    let pterodactylSilhouettes: HTMLCanvasElement[];
    let clouds: HTMLCanvasElement[];
    let smokeWisps: HTMLCanvasElement[];

    if (sheetSky) {
      pterodactylFlap = [
        extractCleanSprite(sheetSky, { x: 34, y: 26, w: 160, h: 108 }, { seed: { x: 65, y: 40 }, clearInteriorWhite: true }),
        extractCleanSprite(sheetSky, { x: 188, y: 34, w: 164, h: 97 }, { seed: { x: 69, y: 40 }, clearInteriorWhite: true }),
        extractCleanSprite(sheetSky, { x: 360, y: 25, w: 144, h: 110 }, { clearInteriorWhite: true }),
        extractCleanSprite(sheetSky, { x: 518, y: 45, w: 166, h: 69 }, { clearInteriorWhite: true }),
        extractCleanSprite(sheetSky, { x: 28, y: 173, w: 214, h: 63 }, { clearInteriorWhite: true }),
        extractCleanSprite(sheetSky, { x: 467, y: 166, w: 191, h: 79 }, { clearInteriorWhite: true }),
      ];

      pterodactylSilhouettes = [
        extractCleanSprite(sheetSky, { x: 38, y: 265, w: 168, h: 101 }, { clearInteriorWhite: true }),
        extractCleanSprite(sheetSky, { x: 230, y: 265, w: 152, h: 103 }, { clearInteriorWhite: true }),
        extractCleanSprite(sheetSky, { x: 413, y: 280, w: 160, h: 74 }, { clearInteriorWhite: true }),
      ];

      clouds = [
        extractCleanSprite(sheetSky, { x: 35, y: 402, w: 380, h: 121 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
        extractCleanSprite(sheetSky, { x: 448, y: 413, w: 310, h: 119 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
        extractCleanSprite(sheetSky, { x: 41, y: 542, w: 379, h: 145 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
        extractCleanSprite(sheetSky, { x: 468, y: 576, w: 270, h: 109 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
        extractCleanSprite(sheetSky, { x: 1017, y: 585, w: 223, h: 87 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
      ];

      smokeWisps = [
        extractCleanSprite(sheetSky, { x: 808, y: 427, w: 204, h: 89 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
        extractCleanSprite(sheetSky, { x: 1046, y: 430, w: 180, h: 81 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
      ];
    } else {
      const skyFallback = createFallbackSkyAssets();
      pterodactylFlap = skyFallback.pterodactylFlap;
      pterodactylSilhouettes = skyFallback.pterodactylSilhouettes;
      clouds = skyFallback.clouds;
      smokeWisps = skyFallback.smokeWisps;
    }

    return {
      panorama,
      rexFrames,
      rexEyeCenters,
      palmLeft,
      palmRight,
      stoneGate,
      dinoStatue,
      eggshell,
      keyItem,
      bulbItem,
      oldBook,
      dvdItem,
      backpackIcon,
      pterodactylFlap,
      pterodactylSilhouettes,
      clouds,
      smokeWisps,
    };
  })();

  return cachedAssetsPromise;
}

