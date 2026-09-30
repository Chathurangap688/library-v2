/**
 * Lesson 4.4 (from v1 Lesson 7): photo helpers, all in the browser (no server CPU needed).
 *   shrinkForAi   — a smaller copy for Gemini (faster upload, same reading quality)
 *   polishCover   — crop to the cover (box from the AI) → resize → auto-levels → JPEG Blob
 */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = URL.createObjectURL(file)
  })
}

function draw(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)   // crop + resize in one step
  return { canvas, ctx }
}

/** Longest side 1280 px, JPEG 80 % → base64 (without the "data:…," prefix) */
export function shrinkForAi(img: HTMLImageElement) {
  const { canvas } = draw(img, 0, 0, img.naturalWidth, img.naturalHeight, 1280)
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
}

/** box = [ymin, xmin, ymax, xmax] on a 0–1000 scale from the AI (or null = the whole photo) */
export function polishCover(img: HTMLImageElement, box: number[] | null): Promise<Blob> {
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
  if (box && box.length === 4) {
    const [ymin, xmin, ymax, xmax] = box
    if (ymax > ymin && xmax > xmin && ymax - ymin > 150 && xmax - xmin > 150) {   // ignore silly boxes
      const pad = 10                                                              // 1 % margin
      sx = Math.max(0, ((xmin - pad) / 1000) * img.naturalWidth)
      sy = Math.max(0, ((ymin - pad) / 1000) * img.naturalHeight)
      sw = Math.min(img.naturalWidth, ((xmax + pad) / 1000) * img.naturalWidth) - sx
      sh = Math.min(img.naturalHeight, ((ymax + pad) / 1000) * img.naturalHeight) - sy
    }
  }
  const { canvas, ctx } = draw(img, sx, sy, sw, sh, 900)     // 900 px: sharp on screen, ~100 KB
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  autoLevels(data.data)
  ctx.putImageData(data, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/jpeg', 0.85))
}

/**
 * Stretch the brightness range to 0–255 (darkest/brightest 0.5 % cut off), same stretch for
 * R, G and B so colours stay true; gentle limits; +8 % saturation. (v1, unchanged)
 */
export function autoLevels(pixels: Uint8ClampedArray) {
  const histogram = new Array(256).fill(0)
  for (let i = 0; i < pixels.length; i += 4) histogram[Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2])]++
  const cut = (pixels.length / 4) * 0.005
  let sum = 0, lo = 0, hi = 255
  while (lo < 255 && (sum += histogram[lo]) < cut) lo++
  sum = 0
  while (hi > 0 && (sum += histogram[hi]) < cut) hi--
  lo = Math.min(lo, 40); hi = Math.max(hi, 215)
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) pixels[i + c] = ((pixels[i + c] - lo) * 255) / (hi - lo)
    const grey = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
    for (let c = 0; c < 3; c++) pixels[i + c] = grey + (pixels[i + c] - grey) * 1.08
  }
}
