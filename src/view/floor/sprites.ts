// Floor sprites made by tools/snapshot-figures.mjs: public/sprites/<figure>.png and .json.

export interface Sprite {
  img: HTMLImageElement;
  tile: [number, number][]; // the machine tile's floor corners in the image, in image pixels
}

const cache = new Map<string, Promise<Sprite | null>>();

export function loadSprite(figure: string): Promise<Sprite | null> {
  let p = cache.get(figure);
  if (!p) {
    p = (async () => {
      const meta = await fetch(`/sprites/${figure}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!meta) return null;
      const img = new Image();
      img.src = `/sprites/${figure}.png`;
      try { await img.decode(); } catch { return null; }
      // the json stores the corners as fractions of the image width
      return { img, tile: (meta.tile as [number, number][]).map(([fx, fy]) => [fx * img.width, fy * img.width]) };
    })();
    cache.set(figure, p);
  }
  return p;
}

/** The canvas transform that puts sprite corners 0, 1 and 3 onto floor points a, b and d. */
export function spriteTransform(s: Sprite, a: [number, number], b: [number, number], d: [number, number]): DOMMatrix {
  const [s0, s1, , s3] = s.tile;
  const u = [s1[0] - s0[0], s1[1] - s0[1]], v = [s3[0] - s0[0], s3[1] - s0[1]];
  const U = [b[0] - a[0], b[1] - a[1]], V = [d[0] - a[0], d[1] - a[1]];
  const det = u[0] * v[1] - v[0] * u[1];
  const inv = [v[1] / det, -v[0] / det, -u[1] / det, u[0] / det]; // inverse of the matrix with columns u, v
  const ma = U[0] * inv[0] + V[0] * inv[2], mc = U[0] * inv[1] + V[0] * inv[3];
  const mb = U[1] * inv[0] + V[1] * inv[2], md = U[1] * inv[1] + V[1] * inv[3];
  return new DOMMatrix([ma, mb, mc, md, a[0] - (ma * s0[0] + mc * s0[1]), a[1] - (mb * s0[0] + md * s0[1])]);
}
