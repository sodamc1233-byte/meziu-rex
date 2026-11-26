import { WORLD_HEIGHT, WORLD_WIDTH } from './rules';

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
    if (inlineMap && inlineMap[src]) {
      return inlineMap[src];
    }
  }
  return src;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
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

let cachedAssetsPromise: Promise<GameAssets> | null = null;

export function loadGameAssets(): Promise<GameAssets> {
  if (cachedAssetsPromise) return cachedAssetsPromise;

  cachedAssetsPromise = (async () => {
    const [sheetProps, sheetSky, bgLeft, bgRight] = await Promise.all([
      loadImage('/assets/aistudio/image_bfcdf26e.png'),
      loadImage('/assets/aistudio/image_d81caafc.png'),
      loadImage('/assets/aistudio/image_d53618c1.png'),
      loadImage('/assets/aistudio/image_96ebf6d7.png'),
    ]);

    const panorama = buildSeamlessPanorama(bgLeft, bgRight);

    const rexEyeCenters = [
      { big: { cx: 100.5, cy: 24, rx: 7.5, ry: 8.5 }, small: { cx: 141, cy: 20, rx: 4.5, ry: 5.2 } },
      { big: { cx: 101, cy: 24, rx: 7.5, ry: 8.5 }, small: { cx: 141.5, cy: 20, rx: 4.5, ry: 5.2 } },
      { big: { cx: 94.5, cy: 23.8, rx: 7.5, ry: 8.5 }, small: { cx: 135.5, cy: 19.5, rx: 4.5, ry: 5.2 } },
      { big: { cx: 96.8, cy: 23.8, rx: 7.5, ry: 8.5 }, small: { cx: 137.5, cy: 19.8, rx: 4.5, ry: 5.2 } },
    ];

    const rawRexRects: SpriteRect[] = [
      { x: 24, y: 69, w: 165, h: 176 },
      { x: 177, y: 68, w: 166, h: 176 },
      { x: 325, y: 66, w: 165, h: 179 },
      { x: 513, y: 68, w: 163, h: 176 },
    ];

    // Connected-component extraction removes adjacent overlapping snouts/tails on Frames 1-3
    // and removes broken disconnected tail motion-stroke fragments on Frame 4 (Tail Whip).
    const rexFrames = rawRexRects.map((rect, idx) => {
      const raw = extractCleanSprite(sheetProps, rect, {
        seed: { x: 85, y: 110 },
        darkInkEdge: true,
      });
      return cleanRexEyeSclera(raw, rexEyeCenters[idx].big, rexEyeCenters[idx].small);
    });

    const palmLeft = extractCleanSprite(sheetProps, { x: 686, y: 9, w: 321, h: 412 }, {
      seed: { x: 160, y: 150 },
      clearInteriorWhite: true,
    });
    const palmRight = extractCleanSprite(sheetProps, { x: 1000, y: 25, w: 254, h: 367 }, {
      seed: { x: 150, y: 120 },
      clearInteriorWhite: true,
    });
    const stoneGate = extractCleanSprite(sheetProps, { x: 35, y: 302, w: 312, h: 381 }, {
      clearInteriorWhite: true,
    });
    const dinoStatue = extractCleanSprite(sheetProps, { x: 374, y: 345, w: 127, h: 171 }, {
      clearInteriorWhite: true,
    });
    const eggshell = extractCleanSprite(sheetProps, { x: 530, y: 400, w: 108, h: 94 }, {
      clearInteriorWhite: false,
      darkInkEdge: false,
    });
    const keyItem = extractCleanSprite(sheetProps, { x: 592, y: 469, w: 91, h: 74 }, {
      seed: { x: 56, y: 34 },
      clearInteriorWhite: true,
    });
    const bulbItem = extractCleanSprite(sheetProps, { x: 515, y: 507, w: 56, h: 68 }, {
      clearInteriorWhite: false,
      darkInkEdge: false,
    });
    const oldBook = extractCleanSprite(sheetProps, { x: 376, y: 558, w: 148, h: 106 }, {
      seed: { x: 60, y: 50 },
      clearInteriorWhite: true,
    });
    const dvdItem = extractCleanSprite(sheetProps, { x: 560, y: 562, w: 95, h: 95 }, {
      clearInteriorWhite: false,
      darkInkEdge: false,
    });
    const backpackIcon = extractCleanSprite(sheetProps, { x: 909, y: 408, w: 98, h: 109 }, {
      clearInteriorWhite: true,
    });

    const pterodactylFlap = [
      extractCleanSprite(sheetSky, { x: 34, y: 26, w: 160, h: 108 }, { seed: { x: 65, y: 40 }, clearInteriorWhite: true }),
      extractCleanSprite(sheetSky, { x: 188, y: 34, w: 164, h: 97 }, { seed: { x: 69, y: 40 }, clearInteriorWhite: true }),
      extractCleanSprite(sheetSky, { x: 360, y: 25, w: 144, h: 110 }, { clearInteriorWhite: true }),
      extractCleanSprite(sheetSky, { x: 518, y: 45, w: 166, h: 69 }, { clearInteriorWhite: true }),
      extractCleanSprite(sheetSky, { x: 28, y: 173, w: 214, h: 63 }, { clearInteriorWhite: true }),
      extractCleanSprite(sheetSky, { x: 467, y: 166, w: 191, h: 79 }, { clearInteriorWhite: true }),
    ];

    const pterodactylSilhouettes = [
      extractCleanSprite(sheetSky, { x: 38, y: 265, w: 168, h: 101 }, { clearInteriorWhite: true }),
      extractCleanSprite(sheetSky, { x: 230, y: 265, w: 152, h: 103 }, { clearInteriorWhite: true }),
      extractCleanSprite(sheetSky, { x: 413, y: 280, w: 160, h: 74 }, { clearInteriorWhite: true }),
    ];

    const clouds = [
      extractCleanSprite(sheetSky, { x: 35, y: 402, w: 380, h: 121 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
      extractCleanSprite(sheetSky, { x: 448, y: 413, w: 310, h: 119 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
      extractCleanSprite(sheetSky, { x: 41, y: 542, w: 379, h: 145 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
      extractCleanSprite(sheetSky, { x: 468, y: 576, w: 270, h: 109 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
      extractCleanSprite(sheetSky, { x: 1017, y: 585, w: 223, h: 87 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
    ];

    const smokeWisps = [
      extractCleanSprite(sheetSky, { x: 808, y: 427, w: 204, h: 89 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
      extractCleanSprite(sheetSky, { x: 1046, y: 430, w: 180, h: 81 }, { whiteThreshold: 214, clearInteriorWhite: true, darkInkEdge: true }),
    ];

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
