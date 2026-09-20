/* BreachForge — procedural card art.
 *
 * RB.procArt(card, width, height) -> HTMLCanvasElement
 *
 * Paints a full-bleed abstract landscape for a card, deterministically derived from card.id alone
 * (no Math.random anywhere in here — the same id always produces the same painting). The palette
 * comes from the card's domain(s); the composition archetype comes from its type. Nothing here
 * ever draws text, letters or numerals.
 *
 * Contract:
 *   - returns a canvas sized width x height in CSS pixels (backing store may be larger for DPR);
 *     safe to append to the DOM or to pass straight to another ctx.drawImage.
 *   - cached per (id, width, height, dpr) — calling it 163 times in a grid render is cheap.
 *   - small sizes are supersampled and downscaled, so a 34px thumbnail reads as a tiny painting
 *     rather than as four noisy pixels.
 */
(function (global) {
  'use strict';

  var RB = (global.RB = global.RB || {});

  /* ------------------------------------------------------------------ *
   * Deterministic randomness
   * ------------------------------------------------------------------ */

  function hashStr(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRnd(seed) {
    var r = mulberry32(seed);
    r.range = function (a, b) { return a + (b - a) * r(); };
    r.int = function (a, b) { return Math.floor(a + (b - a + 1) * r()); };
    r.pick = function (arr) { return arr[Math.floor(r() * arr.length) % arr.length]; };
    r.sign = function () { return r() < 0.5 ? -1 : 1; };
    return r;
  }

  /* Seeded 1-D value noise + fbm — the backbone of every ridge line and cloud band. */
  function makeNoise(rnd) {
    var n = 512;
    var table = new Float64Array(n);
    for (var i = 0; i < n; i++) table[i] = rnd();
    return function (x) {
      var i0 = Math.floor(x);
      var f = x - i0;
      var a = table[((i0 % n) + n) % n];
      var b = table[((i0 + 1) % n + n) % n];
      var t = f * f * (3 - 2 * f);
      return a + (b - a) * t;
    };
  }

  function fbm(noise, x, octaves) {
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var o = 0; o < octaves; o++) {
      sum += noise(x * freq + o * 37.13) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  /* ------------------------------------------------------------------ *
   * Colour helpers
   * ------------------------------------------------------------------ */

  function hex2rgb(h) {
    var t = String(h).trim().replace('#', '');
    if (t.length === 3) t = t[0] + t[0] + t[1] + t[1] + t[2] + t[2];
    var v = parseInt(t.slice(0, 6), 16);
    if (isNaN(v)) return [128, 128, 128];
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgb2css(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function shade(c, t) { // t<0 darken toward black, t>0 lighten toward white
    return t < 0 ? mix(c, [0, 0, 0], -t) : mix(c, [255, 255, 255], t);
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function rgb2hsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var h = 0, sat = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d > 1e-6) {
      sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, sat, l];
  }
  function hsl2rgb(h, sat, l) {
    h = ((h % 360) + 360) % 360;
    sat = clamp(sat, 0, 1); l = clamp(l, 0, 1);
    var cc = (1 - Math.abs(2 * l - 1)) * sat;
    var x = cc * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - cc / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = cc; g = x; }
    else if (h < 120) { r = x; g = cc; }
    else if (h < 180) { g = cc; b = x; }
    else if (h < 240) { g = x; b = cc; }
    else if (h < 300) { r = x; b = cc; }
    else { r = cc; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  /* ------------------------------------------------------------------ *
   * Domain palettes
   *
   * There is ONE home for the domain colours: css/style.css, as --d-Fury ... --d-Colorless (the
   * six official domain colours plus slate). We read those at runtime and derive a full painting
   * kit from each hue — a three-stop sky, the light and its halo, three ridge values deliberately
   * separated so the silhouette stack still reads at 34px, an accent for rim light, and motes.
   * The hex literals below are only a fallback for when the stylesheet is not loaded (the scratch
   * harness, a worker); they are copies of the CSS values, not a second source of truth.
   * ------------------------------------------------------------------ */

  var DOMAIN_HEX_FALLBACK = {
    Fury: '#e04a3c',      // red
    Calm: '#46c06a',      // green
    Mind: '#4a93e8',      // blue
    Body: '#e08a33',      // orange
    Chaos: '#9a5ce0',     // purple
    Order: '#e3cb63',     // yellow
    Colorless: '#8794ab'  // slate
  };

  /* Per-domain character: how far the sky's upper reaches rotate away from the domain hue, how
     dark or high-key the painting sits, and where the accent lands relative to the hue. Small
     numbers — the domain colour still has to be the first thing you read. */
  var CHARACTER = {
    Fury:      { topShift: -14, accentShift:  16, topL: 0.055, midL: 0.20, horizL: 0.56, sat: 1.00, accentSat: 1.00 },
    Calm:      { topShift: -34, accentShift:  16, topL: 0.055, midL: 0.19, horizL: 0.56, sat: 0.95, accentSat: 1.00 },
    Mind:      { topShift: -22, accentShift:  10, topL: 0.060, midL: 0.20, horizL: 0.58, sat: 0.95, accentSat: 1.00 },
    /* Body sits warmer and lower than Fury so the two adjacent hues do not collide. */
    Body:      { topShift: -26, accentShift:  10, topL: 0.055, midL: 0.19, horizL: 0.56, sat: 1.00, accentSat: 1.00 },
    Chaos:     { topShift: -20, accentShift:  26, topL: 0.055, midL: 0.20, horizL: 0.58, sat: 1.00, accentSat: 1.00 },
    /* Order is the high-key one: a pale gold dawn, so it never reads as Body's orange. */
    Order:     { topShift: -26, accentShift:   6, topL: 0.100, midL: 0.31, horizL: 0.72, sat: 0.78, accentSat: 0.88 },
    Colorless: { topShift: -10, accentShift:   4, topL: 0.060, midL: 0.21, horizL: 0.60, sat: 0.70, accentSat: 0.70 }
  };

  function derivePalette(hex, ch) {
    var hsl = rgb2hsl(hex2rgb(hex));
    var h = hsl[0];
    var S = clamp(hsl[1] * ch.sat, 0, 1);
    return {
      sky: [
        hsl2rgb(h + ch.topShift, S * 0.92, ch.topL),
        hsl2rgb(h + ch.topShift * 0.35, S * 0.98, ch.midL),
        hsl2rgb(h + 4, Math.min(1, S * 1.02), ch.horizL)
      ],
      sun: hsl2rgb(h + 6, Math.min(1, S * 1.0), ch.horizL + 0.04),
      halo: hsl2rgb(h + ch.accentShift * 0.6, S * 0.88, ch.horizL + 0.18),
      light: hsl2rgb(h + ch.accentShift * 0.6, S * 0.5, ch.horizL + 0.34),
      ridge: [
        hsl2rgb(h + ch.topShift * 0.2, S * 0.78, ch.midL * 1.0 + 0.04),
        hsl2rgb(h + ch.topShift * 0.4, S * 0.72, ch.topL * 1.3 + 0.045),
        hsl2rgb(h + ch.topShift * 0.6, S * 0.66, ch.topL * 0.7)
      ],
      accent: hsl2rgb(h + ch.accentShift, clamp(S * 1.05 * ch.accentSat / Math.max(ch.sat, 0.01), 0, 1), ch.horizL + 0.06),
      particle: hsl2rgb(h + ch.accentShift * 0.8, S * 0.75, Math.min(0.9, ch.horizL + 0.26)),
      ground: hsl2rgb(h + ch.topShift, S * 0.6, ch.topL * 0.55)
    };
  }

  var PALETTES = null;
  function getPalettes() {
    if (PALETTES) return PALETTES;
    var css = null;
    try {
      if (typeof document !== 'undefined' && document.documentElement && global.getComputedStyle) {
        css = global.getComputedStyle(document.documentElement);
      }
    } catch (e) { css = null; }

    PALETTES = {};
    for (var name in DOMAIN_HEX_FALLBACK) {
      if (!Object.prototype.hasOwnProperty.call(DOMAIN_HEX_FALLBACK, name)) continue;
      var hex = DOMAIN_HEX_FALLBACK[name];
      if (css) {
        var v = (css.getPropertyValue('--d-' + name) || '').trim();
        if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) hex = v;
      }
      PALETTES[name] = derivePalette(hex, CHARACTER[name] || CHARACTER.Colorless);
    }
    return PALETTES;
  }

  function blendPalettes(a, b, t) {
    return {
      sky: [mix(a.sky[0], b.sky[0], t), mix(a.sky[1], b.sky[1], t), mix(a.sky[2], b.sky[2], t)],
      halo: mix(a.halo, b.halo, t),
      light: mix(a.light, b.light, t),
      sun: mix(a.sun, b.sun, t),
      ridge: [mix(a.ridge[0], b.ridge[0], t), mix(a.ridge[1], b.ridge[1], t), mix(a.ridge[2], b.ridge[2], t)],
      /* the second domain keeps its own accent and motes — a Fury/Chaos card should still flash
         the second colour through the first one's sky rather than average into mud. */
      accent: b.accent,
      particle: mix(a.particle, b.particle, 0.65),
      ground: mix(a.ground, b.ground, t)
    };
  }

  function paletteFor(card) {
    var P = getPalettes();
    var list = (card && card.domains && card.domains.length ? card.domains : [card && card.domain]) || [];
    var first = P[list[0]] || P[card && card.domain] || P.Colorless;
    if (list.length > 1 && P[list[1]] && list[1] !== list[0]) {
      return blendPalettes(first, P[list[1]], 0.38);
    }
    return first;
  }

  /* ------------------------------------------------------------------ *
   * Archetype per card type
   * ------------------------------------------------------------------ */

  var ARCH = {
    Unit: 'pedestal',
    Legend: 'summit',
    Spell: 'bloom',
    Gear: 'emblem',
    Battlefield: 'skyline',
    Rune: 'crystal'
  };

  function archetypeFor(card) {
    return ARCH[card && card.type] || 'pedestal';
  }

  /* ------------------------------------------------------------------ *
   * Painting primitives
   * ------------------------------------------------------------------ */

  function skyWash(ctx, W, H, pal, horizon) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb2css(pal.sky[0]));
    g.addColorStop(clamp(horizon * 0.52, 0.06, 0.6), rgb2css(pal.sky[1]));
    g.addColorStop(clamp(horizon, 0.2, 0.95), rgb2css(pal.sky[2]));
    g.addColorStop(1, rgb2css(shade(pal.sky[1], -0.55)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* Soft radial light source. Painted twice — a wide low-alpha bloom and a tight hot core — which
     is what makes it read as light rather than as a pasted circle. */
  function lightSource(ctx, W, H, pal, lx, ly, radius, strength) {
    var prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';

    var g1 = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
    g1.addColorStop(0, rgb2css(pal.halo, 0.55 * strength));
    g1.addColorStop(0.35, rgb2css(pal.sun, 0.24 * strength));
    g1.addColorStop(1, rgb2css(pal.sun, 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    var r2 = radius * 0.24;
    var g2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, r2);
    g2.addColorStop(0, rgb2css(pal.light, 0.85 * strength));
    g2.addColorStop(0.45, rgb2css(pal.halo, 0.35 * strength));
    g2.addColorStop(1, rgb2css(pal.halo, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = prev;
  }

  /* Wide, soft cloud/nebula bands. Squashed radial gradients, additive, following the light. */
  function cloudBands(ctx, W, H, pal, rnd, noise, horizon, lx, count) {
    var prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < count; i++) {
      var cy = H * rnd.range(0.06, horizon * 0.92);
      var cx = W * rnd.range(-0.1, 1.1);
      var rx = W * rnd.range(0.28, 0.85);
      var ry = H * rnd.range(0.025, 0.075);
      var near = 1 - clamp(Math.abs(cx - lx) / W, 0, 1);
      var col = mix(pal.sky[1], pal.halo, 0.3 + 0.6 * near);
      var a = rnd.range(0.05, 0.16) * (0.45 + 0.75 * near);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rnd.range(-0.09, 0.09));
      ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, rgb2css(col, a));
      g.addColorStop(0.55, rgb2css(col, a * 0.4));
      g.addColorStop(1, rgb2css(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = prev;
  }

  /* One parallax silhouette band. Returns the top polyline so callers can reuse it. */
  function ridgeLayer(ctx, W, H, o) {
    var steps = Math.max(28, Math.min(220, Math.round(W / 3)));
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var n = fbm(o.noise, o.phase + t * o.freq, 4);
      if (o.peak) n = 1 - Math.abs(n * 2 - 1);
      var y = o.yBase - n * o.amp - fbm(o.noise, o.phase * 1.7 + t * o.freq * 3.1, 2) * o.amp * 0.22;
      pts.push([t * W, y]);
    }

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.lineTo(W, H + 2);
    ctx.lineTo(0, H + 2);
    ctx.closePath();
    ctx.fillStyle = rgb2css(o.color);
    ctx.fill();

    /* Haze: atmosphere sits in front of far ridges, tinted toward the horizon colour. */
    if (o.haze > 0) {
      ctx.save();
      ctx.clip();
      var hg = ctx.createLinearGradient(0, o.yBase - o.amp, 0, Math.min(H, o.yBase + o.amp * 1.4));
      hg.addColorStop(0, rgb2css(o.hazeColor, o.haze));
      hg.addColorStop(1, rgb2css(o.hazeColor, 0));
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    /* Rim light along the crest, brightest where it faces the light. */
    if (o.rim > 0) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      var span = W * 0.62;
      var rg = ctx.createLinearGradient(o.lightX - span, 0, o.lightX + span, 0);
      rg.addColorStop(0, rgb2css(o.rimColor, 0));
      rg.addColorStop(0.5, rgb2css(o.rimColor, o.rim));
      rg.addColorStop(1, rgb2css(o.rimColor, 0));
      ctx.strokeStyle = rg;
      ctx.lineWidth = Math.max(0.7, W * 0.006);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    return pts;
  }

  /* Fill a path already on ctx with a dark silhouette plus a light-facing rim. */
  function silhouette(ctx, W, pal, lightX, opts) {
    var body = opts && opts.color ? opts.color : shade(pal.ridge[2], -0.25);
    ctx.fillStyle = rgb2css(body, opts && opts.alpha !== undefined ? opts.alpha : 1);
    ctx.fill();
    if (!opts || opts.rim !== false) {
      var span = W * 0.5;
      var rc = (opts && opts.rimColor) || pal.accent;
      var g = ctx.createLinearGradient(lightX - span, 0, lightX + span, 0);
      g.addColorStop(0, rgb2css(rc, 0));
      g.addColorStop(0.5, rgb2css(rc, (opts && opts.rim) || 0.75));
      g.addColorStop(1, rgb2css(rc, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(0.8, W * 0.008);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   * Composition archetypes
   * ------------------------------------------------------------------ */

  /* Unit — a figure-shaped mass on a pedestal, dead centre, backlit.
     Two stances, so 56 units do not all read as the same hooded bell: an upright humanoid with a
     real neck break and a weapon line, or a low crouched beast with a raised haunch and a spined
     back. Both are pure silhouette — no face, no interior detail, nothing that could read as text. */
  function archPedestal(ctx, W, H, s) {
    var pal = s.pal, rnd = s.rnd;
    var cx = W * s.figureX;
    var baseY = H * 1.01;
    var plinthTopY = H * rnd.range(0.83, 0.87);
    var plinthW = W * rnd.range(0.5, 0.68);
    var plinthTopW = plinthW * 0.66;

    /* Plinth sits at a MID value so the near-black figure separates from it. Its top face
       catches the sky, which is what makes it read as a block rather than an outline. */
    ctx.beginPath();
    ctx.moveTo(cx - plinthW / 2, baseY);
    ctx.lineTo(cx - plinthTopW / 2, plinthTopY);
    ctx.lineTo(cx + plinthTopW / 2, plinthTopY);
    ctx.lineTo(cx + plinthW / 2, baseY);
    ctx.closePath();
    silhouette(ctx, W, pal, s.lx, { color: mix(pal.ridge[1], pal.ridge[2], 0.45), rim: 0.55 });
    ctx.beginPath();
    ctx.moveTo(cx - plinthTopW / 2, plinthTopY);
    ctx.lineTo(cx + plinthTopW / 2, plinthTopY);
    ctx.lineTo(cx + plinthTopW / 2, plinthTopY + H * 0.016);
    ctx.lineTo(cx - plinthTopW / 2, plinthTopY + H * 0.016);
    ctx.closePath();
    ctx.fillStyle = rgb2css(mix(pal.ridge[1], pal.sky[2], 0.4), 0.8);
    ctx.fill();

    var dark = shade(pal.ridge[2], -0.62);
    var beast = rnd() < 0.32;

    if (!beast) {
      var headR = W * rnd.range(0.062, 0.078);
      var headY = plinthTopY - H * rnd.range(0.31, 0.39);
      var neckY = headY + headR * 1.5;
      var shoulderY = neckY + headR * 0.55;
      var shoulderW = headR * rnd.range(5.2, 6.6);   /* shoulders are the widest point, not the hem */
      var waistW = shoulderW * rnd.range(0.5, 0.62);
      var hemW = shoulderW * rnd.range(0.84, 1.05);
      var waistY = shoulderY + (plinthTopY - shoulderY) * 0.34;
      var footY = plinthTopY + H * 0.004;

      /* cape thrown to one side — breaks the symmetry that made this read as a chess piece */
      var capeSide = rnd.pick([1, -1]);
      ctx.beginPath();
      ctx.moveTo(cx - capeSide * shoulderW * 0.36, shoulderY);
      ctx.quadraticCurveTo(cx + capeSide * shoulderW * 0.95, waistY, cx + capeSide * shoulderW * rnd.range(0.7, 1.05), footY);
      ctx.lineTo(cx + capeSide * shoulderW * 0.1, footY);
      ctx.quadraticCurveTo(cx + capeSide * shoulderW * 0.2, waistY, cx + capeSide * shoulderW * 0.3, shoulderY);
      ctx.closePath();
      silhouette(ctx, W, pal, s.lx, { color: shade(dark, 0.08), rim: 0.7 });

      ctx.beginPath();
      /* left leg, hip, waist */
      ctx.moveTo(cx - hemW * 0.46, footY);
      ctx.lineTo(cx - hemW * 0.42, waistY + (footY - waistY) * 0.25);
      ctx.quadraticCurveTo(cx - waistW * 0.56, waistY, cx - waistW / 2, shoulderY + headR * 0.55);
      /* arm hanging outside the torso, then the pauldron corner */
      ctx.lineTo(cx - shoulderW * 0.44, waistY - (waistY - shoulderY) * 0.1);
      ctx.lineTo(cx - shoulderW * 0.5, shoulderY + headR * 0.32);
      ctx.quadraticCurveTo(cx - shoulderW * 0.5, shoulderY - headR * 0.18, cx - shoulderW * 0.33, shoulderY - headR * 0.1);
      /* neck notch */
      ctx.lineTo(cx - headR * 0.62, neckY);
      ctx.lineTo(cx - headR * 0.6, headY + headR * 0.6);
      ctx.arc(cx, headY, headR, Math.PI * 0.84, Math.PI * 0.16, false);
      ctx.lineTo(cx + headR * 0.6, neckY);
      ctx.lineTo(cx + shoulderW * 0.33, shoulderY - headR * 0.1);
      ctx.quadraticCurveTo(cx + shoulderW * 0.5, shoulderY - headR * 0.18, cx + shoulderW * 0.5, shoulderY + headR * 0.32);
      ctx.lineTo(cx + shoulderW * 0.44, waistY - (waistY - shoulderY) * 0.1);
      ctx.quadraticCurveTo(cx + waistW * 0.56, waistY, cx + hemW * 0.42, waistY + (footY - waistY) * 0.25);
      ctx.lineTo(cx + hemW * 0.46, footY);
      /* a V notch between the legs, so the base is not one solid skirt */
      ctx.lineTo(cx + hemW * 0.14, footY);
      ctx.lineTo(cx, footY - (footY - waistY) * rnd.range(0.25, 0.45));
      ctx.lineTo(cx - hemW * 0.14, footY);
      ctx.closePath();
      silhouette(ctx, W, pal, s.lx, { color: dark, rim: 1 });

      /* a crest, horn or topknot on the helm — a third of them get one */
      if (rnd() < 0.42) {
        ctx.beginPath();
        ctx.moveTo(cx - headR * 0.5, headY - headR * 0.75);
        ctx.lineTo(cx + rnd.range(-0.2, 0.6) * headR, headY - headR * rnd.range(1.8, 2.8));
        ctx.lineTo(cx + headR * 0.55, headY - headR * 0.7);
        ctx.closePath();
        silhouette(ctx, W, pal, s.lx, { color: dark, rim: 0.8 });
      }

      /* a weapon line: haft + head, or a bow arc, or a pair of blades — always asymmetric */
      var side = rnd.pick([1, -1]);
      var sx = cx + side * shoulderW * rnd.range(0.55, 0.75);
      var kind = rnd();
      ctx.save();
      ctx.translate(sx, plinthTopY);
      ctx.rotate(side * rnd.range(0.04, 0.18));
      if (kind < 0.45) { /* polearm */
        var hl = H * rnd.range(0.42, 0.56);
        ctx.beginPath();
        ctx.rect(-W * 0.011, -hl, W * 0.022, hl);
        silhouette(ctx, W, pal, W / 2, { color: dark, rim: 0.7 });
        ctx.beginPath();
        ctx.moveTo(0, -hl - H * 0.075);
        ctx.lineTo(W * 0.045, -hl + H * 0.012);
        ctx.lineTo(0, -hl + H * 0.03);
        ctx.lineTo(-W * 0.045, -hl + H * 0.012);
        ctx.closePath();
        silhouette(ctx, W, pal, W / 2, { color: dark, rim: 0.8 });
      } else if (kind < 0.75) { /* greatblade planted in the plinth */
        var bl = H * rnd.range(0.34, 0.46);
        ctx.beginPath();
        ctx.moveTo(-W * 0.026, 0);
        ctx.lineTo(-W * 0.02, -bl);
        ctx.lineTo(0, -bl - H * 0.035);
        ctx.lineTo(W * 0.02, -bl);
        ctx.lineTo(W * 0.026, 0);
        ctx.closePath();
        silhouette(ctx, W, pal, W / 2, { color: dark, rim: 0.85 });
        ctx.beginPath();
        ctx.rect(-W * 0.06, -bl - H * 0.005, W * 0.12, H * 0.014);
        silhouette(ctx, W, pal, W / 2, { color: dark, rim: 0.6 });
      } else { /* bow / crescent */
        var br = H * rnd.range(0.2, 0.26);
        ctx.beginPath();
        ctx.arc(0, -br * 1.1, br, Math.PI * 1.15, Math.PI * 1.85);
        ctx.strokeStyle = rgb2css(dark);
        ctx.lineWidth = Math.max(1, W * 0.02);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.strokeStyle = rgb2css(pal.accent, 0.6);
        ctx.lineWidth = Math.max(0.5, W * 0.006);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      /* crouched beast: low slung chest, raised haunch, forward head, spined back */
      var bw = W * rnd.range(0.52, 0.66);
      var bh = H * rnd.range(0.2, 0.26);
      var topY = plinthTopY - bh;
      var faceDir = rnd.pick([1, -1]);
      var hx = cx - faceDir * bw * 0.42;
      var hy2 = topY + bh * rnd.range(0.3, 0.5);

      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, plinthTopY + H * 0.004);
      ctx.quadraticCurveTo(cx - bw * 0.52, topY + bh * 0.35, cx - bw * 0.18, topY + bh * 0.1);
      ctx.quadraticCurveTo(cx + bw * 0.2, topY - bh * 0.18, cx + bw * 0.46, topY + bh * 0.42);
      ctx.quadraticCurveTo(cx + bw * 0.56, plinthTopY - bh * 0.1, cx + bw / 2, plinthTopY + H * 0.004);
      ctx.closePath();
      silhouette(ctx, W, pal, s.lx, { color: dark, rim: 1 });

      /* head + muzzle thrust forward */
      ctx.beginPath();
      ctx.ellipse(hx, hy2, bw * 0.15, bh * 0.34, faceDir * 0.25, 0, Math.PI * 2);
      silhouette(ctx, W, pal, s.lx, { color: dark, rim: 0.9 });
      /* horns */
      ctx.beginPath();
      ctx.moveTo(hx - bw * 0.06, hy2 - bh * 0.22);
      ctx.lineTo(hx - bw * 0.12, hy2 - bh * 0.62);
      ctx.lineTo(hx + bw * 0.01, hy2 - bh * 0.24);
      ctx.closePath();
      silhouette(ctx, W, pal, s.lx, { color: dark, rim: 0.7 });

      /* dorsal spines */
      var spines = rnd.int(3, 5);
      for (var sp = 0; sp < spines; sp++) {
        var t = (sp + 0.5) / spines;
        var px = cx - bw * 0.18 + t * bw * 0.6;
        var py = topY + bh * 0.02 + Math.abs(t - 0.5) * bh * 0.3;
        ctx.beginPath();
        ctx.moveTo(px - bw * 0.035, py);
        ctx.lineTo(px, py - bh * rnd.range(0.3, 0.55));
        ctx.lineTo(px + bw * 0.035, py);
        ctx.closePath();
        silhouette(ctx, W, pal, s.lx, { color: dark, rim: 0.6 });
      }
    }

    /* ground shadow pooling out from the plinth */
    var sg = ctx.createLinearGradient(0, H * 0.86, 0, H);
    sg.addColorStop(0, rgb2css(pal.ground, 0));
    sg.addColorStop(1, rgb2css(pal.ground, 0.8));
    ctx.fillStyle = sg;
    ctx.fillRect(0, H * 0.86, W, H * 0.15);
  }

  /* Legend — a tall backlit throne between flanking pillars, crowned and haloed. Portrait
     proportion: the mass runs from the very bottom of the frame to roughly a fifth from the top,
     which is what separates a Legend from a Unit at thumbnail size. */
  function archSummit(ctx, W, H, s) {
    var pal = s.pal, rnd = s.rnd;
    var cx = W * 0.5;
    var peakY = H * rnd.range(0.15, 0.21);
    var baseY = H * 1.02;
    var dark = shade(pal.ridge[2], -0.5);

    /* sunburst + rings behind everything */
    var hy = peakY + H * rnd.range(0.14, 0.2);
    var hr = W * rnd.range(0.34, 0.42);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var spokes = rnd.int(12, 18);
    var sRot = rnd.range(0, Math.PI);
    for (var i = 0; i < spokes; i++) {
      var a = sRot + (i / spokes) * Math.PI * 2;
      var l0 = hr * 0.72, l1 = hr * rnd.range(1.15, 1.6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * l0, hy + Math.sin(a) * l0);
      ctx.lineTo(cx + Math.cos(a) * l1, hy + Math.sin(a) * l1);
      ctx.strokeStyle = rgb2css(pal.halo, rnd.range(0.1, 0.3));
      ctx.lineWidth = Math.max(0.6, W * rnd.range(0.008, 0.022));
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, hy, hr, 0, Math.PI * 2);
    ctx.strokeStyle = rgb2css(pal.halo, 0.42);
    ctx.lineWidth = Math.max(1, W * 0.014);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, hy, hr * 1.2, 0, Math.PI * 2);
    ctx.strokeStyle = rgb2css(pal.accent, 0.16);
    ctx.lineWidth = Math.max(0.6, W * 0.006);
    ctx.stroke();
    ctx.restore();

    /* flanking pillars, uneven heights, with capitals */
    var pw = W * rnd.range(0.085, 0.115);
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var px = cx + sgn * W * rnd.range(0.28, 0.34);
      var pTop = H * rnd.range(0.4, 0.55);
      ctx.beginPath();
      ctx.rect(px - pw / 2, pTop, pw, baseY - pTop);
      silhouette(ctx, W, pal, s.lx, { color: mix(dark, pal.ridge[1], 0.22), rim: 0.65 });
      ctx.beginPath();
      ctx.rect(px - pw * 0.78, pTop - H * 0.028, pw * 1.56, H * 0.03);
      silhouette(ctx, W, pal, s.lx, { color: mix(dark, pal.ridge[1], 0.28), rim: 0.7 });
    }

    /* the throne: a broad base narrowing to a shaft, crowned with spikes */
    var baseW = W * rnd.range(0.44, 0.54);
    var shaftW = W * rnd.range(0.2, 0.26);
    var shoulderY = H * rnd.range(0.5, 0.58);
    ctx.beginPath();
    ctx.moveTo(cx - baseW / 2, baseY);
    ctx.lineTo(cx - baseW * 0.42, H * 0.72);
    ctx.lineTo(cx - shaftW * 0.62, shoulderY);
    ctx.lineTo(cx - shaftW / 2, peakY + H * 0.05);
    ctx.lineTo(cx + shaftW / 2, peakY + H * 0.05);
    ctx.lineTo(cx + shaftW * 0.62, shoulderY);
    ctx.lineTo(cx + baseW * 0.42, H * 0.72);
    ctx.lineTo(cx + baseW / 2, baseY);
    ctx.closePath();
    silhouette(ctx, W, pal, s.lx, { color: dark, rim: 1 });

    /* crown: three to five spikes of uneven height along the shaft top */
    var pts = rnd.int(3, 5);
    for (var c = 0; c < pts; c++) {
      var t = (c + 0.5) / pts;
      var sx = cx - shaftW / 2 + t * shaftW;
      var hgt = H * rnd.range(0.05, 0.12) * (1 - Math.abs(t - 0.5) * 0.9);
      ctx.beginPath();
      ctx.moveTo(sx - shaftW / (pts * 2.2), peakY + H * 0.055);
      ctx.lineTo(sx, peakY + H * 0.05 - hgt);
      ctx.lineTo(sx + shaftW / (pts * 2.2), peakY + H * 0.055);
      ctx.closePath();
      silhouette(ctx, W, pal, s.lx, { color: dark, rim: 0.85 });
    }

    /* stepped approach */
    var steps = rnd.int(3, 4);
    for (var k = 0; k < steps; k++) {
      var f = k / steps;
      var y = H * (0.84 + f * 0.14);
      var wS = W * (0.56 + f * 0.62);
      ctx.beginPath();
      ctx.rect(cx - wS / 2, y, wS, H * 0.045);
      silhouette(ctx, W, pal, s.lx, { color: mix(dark, pal.ridge[1], 0.3 - f * 0.2), rim: 0.4 });
    }
  }

  /* Spell — radiating arcs and an energy bloom. */
  function archBloom(ctx, W, H, s) {
    var pal = s.pal, rnd = s.rnd;
    var cx = s.lx, cy = s.ly;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* Broad tapered petals of light rather than thin radar spokes — six to nine of them, uneven
       lengths, so the bloom has a direction instead of reading as a clock face. */
    var rays = rnd.int(6, 9);
    var rot = rnd.range(0, Math.PI);
    var bias = rnd.range(0, Math.PI * 2);
    for (var i = 0; i < rays; i++) {
      var a = rot + (i / rays) * Math.PI * 2 + rnd.range(-0.14, 0.14);
      var lean = 0.55 + 0.45 * Math.cos(a - bias);
      var len = W * rnd.range(0.4, 0.85) * lean;
      var halfW = rnd.range(0.05, 0.13);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(
        cx + Math.cos(a - halfW) * len * 0.6, cy + Math.sin(a - halfW) * len * 0.6,
        cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.quadraticCurveTo(
        cx + Math.cos(a + halfW) * len * 0.6, cy + Math.sin(a + halfW) * len * 0.6,
        cx, cy);
      ctx.closePath();
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, len);
      rg.addColorStop(0, rgb2css(pal.halo, 0.3));
      rg.addColorStop(0.3, rgb2css(pal.accent, 0.14));
      rg.addColorStop(1, rgb2css(pal.accent, 0));
      ctx.fillStyle = rg;
      ctx.fill();
    }

    /* Arc fragments on offset centres — broken rings, not concentric circles. */
    var arcs = rnd.int(3, 5);
    for (var k = 0; k < arcs; k++) {
      var ox = cx + W * rnd.range(-0.07, 0.07);
      var oy = cy + H * rnd.range(-0.05, 0.05);
      var r = W * (0.2 + k * rnd.range(0.09, 0.14));
      var a0 = rnd.range(0, Math.PI * 2);
      var ext = rnd.range(Math.PI * 0.35, Math.PI * 0.95);
      ctx.beginPath();
      ctx.arc(ox, oy, r, a0, a0 + ext);
      ctx.strokeStyle = rgb2css(k % 2 ? pal.accent : pal.halo, 0.3 - k * 0.04);
      ctx.lineWidth = Math.max(0.7, W * (0.016 - k * 0.0028));
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    /* Core: hot but small, and it holds its hue instead of clipping to white paper. */
    var coreR = W * 0.17;
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    cg.addColorStop(0, rgb2css(mix(pal.light, [255, 255, 255], 0.4), 0.8));
    cg.addColorStop(0.18, rgb2css(pal.light, 0.5));
    cg.addColorStop(0.45, rgb2css(pal.halo, 0.26));
    cg.addColorStop(1, rgb2css(pal.halo, 0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    /* A shockwave ellipse on the ground plane — only on some of them, and faint, so it is an
       occasional beat rather than a rut every Spell shares. */
    if (rnd() < 0.55) {
      ctx.save();
      ctx.translate(cx + W * rnd.range(-0.06, 0.06), H * rnd.range(0.8, 0.88));
      ctx.scale(1, rnd.range(0.14, 0.24));
      ctx.beginPath();
      ctx.arc(0, 0, W * rnd.range(0.34, 0.54), 0, Math.PI * 2);
      ctx.strokeStyle = rgb2css(pal.accent, 0.17);
      ctx.lineWidth = Math.max(1, W * 0.05);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    /* a dark near-ground so the bloom has something to blow out against */
    ctx.beginPath();
    var gy = H * 0.9;
    ctx.moveTo(0, gy + H * 0.02);
    ctx.quadraticCurveTo(W * 0.5, gy - H * 0.05, W, gy + H * 0.02);
    ctx.lineTo(W, H + 2); ctx.lineTo(0, H + 2); ctx.closePath();
    silhouette(ctx, W, pal, cx, { color: shade(pal.ridge[2], -0.4), rim: 0.55 });
  }

  /* Gear — a geometric emblem / frame motif. */
  function archEmblem(ctx, W, H, s) {
    var pal = s.pal, rnd = s.rnd;
    var cx = W * 0.5, cy = H * 0.52;
    var R = Math.min(W, H) * rnd.range(0.3, 0.36);
    var sides = rnd.pick([6, 6, 8, 4]);
    var rot = sides === 4 ? Math.PI / 4 : (sides === 6 ? Math.PI / 6 : Math.PI / 8);

    function poly(r, rotation) {
      ctx.beginPath();
      for (var i = 0; i < sides; i++) {
        var a = rotation + (i / sides) * Math.PI * 2;
        var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    /* backlight behind the emblem */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    bg.addColorStop(0, rgb2css(pal.halo, 0.45));
    bg.addColorStop(1, rgb2css(pal.halo, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* outer plate */
    poly(R, rot);
    silhouette(ctx, W, pal, s.lx, { color: shade(pal.ridge[2], -0.3), rim: 0.9 });

    /* inner cut-out ring, punched through to the glow */
    ctx.save();
    poly(R, rot);
    ctx.clip();
    var ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.62);
    ig.addColorStop(0, rgb2css(pal.light, 0.75));
    ig.addColorStop(0.55, rgb2css(pal.sun, 0.3));
    ig.addColorStop(1, rgb2css(pal.sun, 0));
    ctx.fillStyle = ig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    poly(R * 0.62, rot);
    ctx.strokeStyle = rgb2css(shade(pal.ridge[2], -0.2), 0.95);
    ctx.lineWidth = Math.max(1, W * 0.03);
    ctx.stroke();
    ctx.strokeStyle = rgb2css(pal.accent, 0.6);
    ctx.lineWidth = Math.max(0.6, W * 0.007);
    ctx.stroke();

    /* an inner mechanism: crossed spars and a dark hub, so the aperture is a device not a hole */
    var spars = rnd.pick([3, 4]);
    var sRot = rnd.range(0, Math.PI);
    ctx.save();
    ctx.strokeStyle = rgb2css(shade(pal.ridge[2], -0.35), 0.9);
    ctx.lineWidth = Math.max(0.9, W * 0.016);
    ctx.lineCap = 'butt';
    for (var sp = 0; sp < spars; sp++) {
      var sa = sRot + (sp / spars) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(sa) * R * 0.58, cy - Math.sin(sa) * R * 0.58);
      ctx.lineTo(cx + Math.cos(sa) * R * 0.58, cy + Math.sin(sa) * R * 0.58);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R * rnd.range(0.16, 0.24), 0, Math.PI * 2);
    ctx.fillStyle = rgb2css(shade(pal.ridge[2], -0.4));
    ctx.fill();
    ctx.strokeStyle = rgb2css(pal.accent, 0.75);
    ctx.lineWidth = Math.max(0.6, W * 0.008);
    ctx.stroke();
    ctx.restore();

    /* bolts around the plate */
    var bolts = sides;
    for (var b = 0; b < bolts; b++) {
      var ba = rot + (b / bolts) * Math.PI * 2 + Math.PI / bolts;
      var bx = cx + Math.cos(ba) * R * 0.82, by = cy + Math.sin(ba) * R * 0.82;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(0.8, W * 0.022), 0, Math.PI * 2);
      ctx.fillStyle = rgb2css(shade(pal.ridge[2], -0.45));
      ctx.fill();
      ctx.strokeStyle = rgb2css(pal.accent, 0.45);
      ctx.lineWidth = Math.max(0.5, W * 0.005);
      ctx.stroke();
    }

    /* corner brackets frame the composition */
    var m = W * 0.07, L = W * 0.16, lw = Math.max(1, W * 0.018);
    ctx.strokeStyle = rgb2css(shade(pal.ridge[1], -0.1), 0.85);
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    var corners = [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]];
    for (var c = 0; c < corners.length; c++) {
      var q = corners[c];
      ctx.beginPath();
      ctx.moveTo(q[0] + q[2] * L, q[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.lineTo(q[0], q[1] + q[3] * L);
      ctx.stroke();
    }

    /* dark base so the emblem is mounted, not floating */
    ctx.beginPath();
    ctx.moveTo(0, H * 0.93);
    ctx.lineTo(W, H * 0.9);
    ctx.lineTo(W, H + 2); ctx.lineTo(0, H + 2);
    ctx.closePath();
    silhouette(ctx, W, pal, s.lx, { color: shade(pal.ridge[2], -0.4), rim: 0.4 });
  }

  /* Battlefield — a wide low horizon with architecture-like blocks. */
  function archSkyline(ctx, W, H, s) {
    var pal = s.pal, rnd = s.rnd;

    function row(baseY, maxH, color, rimA, count, gap) {
      var x = -W * 0.05;
      var pts = [];
      while (x < W * 1.05) {
        var bw = W * rnd.range(0.06, 0.2);
        var bh = maxH * rnd.range(0.25, 1);
        pts.push([x, baseY - bh, bw, bh]);
        x += bw + W * gap * rnd.range(0.2, 1);
      }
      ctx.beginPath();
      ctx.moveTo(-W * 0.06, baseY);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        ctx.lineTo(p[0], baseY);
        ctx.lineTo(p[0], p[1]);
        /* an occasional pitched roof or spire tip */
        if (rnd() < 0.3) {
          ctx.lineTo(p[0] + p[2] * 0.5, p[1] - p[3] * 0.35);
          ctx.lineTo(p[0] + p[2], p[1]);
        } else {
          ctx.lineTo(p[0] + p[2], p[1]);
        }
        ctx.lineTo(p[0] + p[2], baseY);
      }
      ctx.lineTo(W * 1.06, baseY);
      ctx.lineTo(W * 1.06, H + 2);
      ctx.lineTo(-W * 0.06, H + 2);
      ctx.closePath();
      ctx.fillStyle = rgb2css(color);
      ctx.fill();
      var span = W * 0.6;
      var g = ctx.createLinearGradient(s.lx - span, 0, s.lx + span, 0);
      g.addColorStop(0, rgb2css(pal.accent, 0));
      g.addColorStop(0.5, rgb2css(pal.accent, rimA));
      g.addColorStop(1, rgb2css(pal.accent, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(0.6, W * 0.005);
      ctx.stroke();
    }

    row(H * 0.79, H * 0.2, mix(pal.ridge[1], pal.sky[2], 0.22), 0.3, 0, 0.03);
    row(H * 0.88, H * 0.17, shade(pal.ridge[2], -0.15), 0.55, 0, 0.05);

    /* a low causeway / wall across the very front */
    ctx.beginPath();
    ctx.rect(-2, H * 0.945, W + 4, H * 0.06);
    silhouette(ctx, W, pal, s.lx, { color: shade(pal.ridge[2], -0.5), rim: 0.45 });

    /* reflected light pooling on the flat ground */
    var pg = ctx.createLinearGradient(0, H * 0.88, 0, H * 0.95);
    pg.addColorStop(0, rgb2css(pal.sun, 0.16));
    pg.addColorStop(1, rgb2css(pal.sun, 0));
    ctx.fillStyle = pg;
    ctx.fillRect(0, H * 0.88, W, H * 0.07);
  }

  /* Rune — a crystalline facet cluster. */
  function archCrystal(ctx, W, H, s) {
    var pal = s.pal, rnd = s.rnd;

    function shard(cx, cy, w, h, tilt, valueBias) {
      var half = w / 2;
      var pts = [
        [0, -h / 2],
        [half, -h * 0.18],
        [half * 0.72, h / 2],
        [-half * 0.72, h / 2],
        [-half, -h * 0.18]
      ];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = rgb2css(shade(pal.ridge[2], -0.2 + valueBias * 0.2));
      ctx.fill();

      /* facets: fan triangles from the apex, each a different value */
      ctx.save();
      ctx.clip();
      for (var f = 0; f < pts.length; f++) {
        var a = pts[f], b = pts[(f + 1) % pts.length];
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.02);
        ctx.lineTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.closePath();
        var lit = f === 1 || f === 4 ? 1 : (f === 0 ? 0.6 : 0.12);
        var col = mix(shade(pal.ridge[1], -0.25), pal.halo, lit * (0.45 + valueBias * 0.5));
        ctx.fillStyle = rgb2css(col, 0.55 + lit * 0.4);
        ctx.fill();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.closePath();
      ctx.strokeStyle = rgb2css(pal.accent, 0.7);
      ctx.lineWidth = Math.max(0.6, W * 0.007);
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    /* glow behind the cluster */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(W * 0.5, H * 0.56, 0, W * 0.5, H * 0.56, W * 0.6);
    g.addColorStop(0, rgb2css(pal.halo, 0.5));
    g.addColorStop(1, rgb2css(pal.halo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    shard(W * rnd.range(0.26, 0.34), H * 0.66, W * 0.26, H * 0.34, rnd.range(-0.3, -0.1), 0.2);
    shard(W * rnd.range(0.68, 0.76), H * 0.68, W * 0.22, H * 0.28, rnd.range(0.1, 0.32), 0.1);
    shard(W * 0.5, H * 0.54, W * 0.36, H * 0.56, rnd.range(-0.06, 0.06), 1);

    /* shattered base rubble */
    ctx.beginPath();
    ctx.moveTo(0, H * 0.9);
    for (var i = 0; i <= 8; i++) {
      var t = i / 8;
      ctx.lineTo(t * W, H * (0.9 + (i % 2 ? 0.035 : -0.02)));
    }
    ctx.lineTo(W, H + 2); ctx.lineTo(0, H + 2); ctx.closePath();
    silhouette(ctx, W, pal, s.lx, { color: shade(pal.ridge[2], -0.45), rim: 0.5 });
  }

  var ARCH_FN = {
    pedestal: archPedestal,
    summit: archSummit,
    bloom: archBloom,
    emblem: archEmblem,
    skyline: archSkyline,
    crystal: archCrystal
  };

  /* ------------------------------------------------------------------ *
   * Particles, grade, grain
   * ------------------------------------------------------------------ */

  /* Drifting motes / embers. Called twice: a dense pass behind the subject (depth) and a sparse,
     smaller pass in front (atmosphere). Density falls off away from the light and they cluster
     loosely rather than spreading evenly, which is the difference between "airborne" and "dust on
     the lens". */
  function particles(ctx, W, H, pal, rnd, lx, ly, opts) {
    var base = clamp((W * H) / 1400, 10, 54);
    var n = Math.round(base * (opts.density || 1));
    var scale = opts.scale || 1;
    var drift = opts.drift;
    var clusters = [];
    var cn = Math.max(2, Math.round(n / 9));
    for (var c = 0; c < cn; c++) clusters.push([rnd() * W, rnd.range(H * 0.05, H * 0.95)]);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var cl = clusters[i % clusters.length];
      var spread = W * 0.3;
      var x = clamp(cl[0] + (rnd() - 0.5) * spread * 2, -W * 0.02, W * 1.02);
      var y = clamp(cl[1] + (rnd() - 0.5) * spread * 1.6, -H * 0.02, H * 1.02);
      var d = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly)) / (W * 1.2);
      var a = clamp(0.7 - d * 0.5, 0.05, 0.7) * rnd.range(0.35, 1) * (opts.alpha || 1);
      var r = Math.max(0.35, W * rnd.range(0.003, 0.0085) * scale);
      var col = rnd() < 0.28 ? pal.accent : pal.particle;
      var gg = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      gg.addColorStop(0, rgb2css(col, a));
      gg.addColorStop(0.3, rgb2css(col, a * 0.3));
      gg.addColorStop(1, rgb2css(col, 0));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      /* a few streak along the drift axis — short, and never vertical enough to read as rain */
      if (rnd() < 0.16) {
        ctx.strokeStyle = rgb2css(col, a * 0.45);
        ctx.lineWidth = Math.max(0.35, r * 0.8);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(drift) * W * 0.045, y + Math.sin(drift) * W * 0.045);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function grade(ctx, W, H, pal, horizon) {
    /* warm/cool push from the horizon colour into the upper frame */
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb2css(pal.sky[0], 0.5));
    g.addColorStop(horizon, rgb2css(pal.sun, 0.35));
    g.addColorStop(1, rgb2css(pal.ground, 0.6));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function vignette(ctx, W, H, pal) {
    var r = Math.max(W, H) * 0.78;
    var g = ctx.createRadialGradient(W * 0.5, H * 0.46, r * 0.26, W * 0.5, H * 0.5, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, rgb2css(shade(pal.ground, -0.3), 0.72));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var b = ctx.createLinearGradient(0, H * 0.72, 0, H);
    b.addColorStop(0, 'rgba(0,0,0,0)');
    b.addColorStop(1, rgb2css(shade(pal.ground, -0.4), 0.55));
    ctx.fillStyle = b;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  }

  /* One shared 64x64 noise tile, built once, reused as a pattern for the painterly grain. */
  var grainTile = null;
  function getGrainTile() {
    if (grainTile) return grainTile;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var img = g.createImageData(64, 64);
    var r = mulberry32(0x9e3779b9);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 96 + Math.floor(r() * 64);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTile = c;
    return c;
  }

  function grain(ctx, W, H, amount) {
    try {
      var pat = ctx.createPattern(getGrainTile(), 'repeat');
      if (!pat) return;
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = amount;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } catch (e) { /* pattern unsupported — the painting is fine without it */ }
  }

  /* ------------------------------------------------------------------ *
   * The painting
   * ------------------------------------------------------------------ */

  function paint(ctx, W, H, card) {
    var seed = hashStr(String((card && card.id) || 'breachforge'));
    var rnd = makeRnd(seed);
    var noise = makeNoise(makeRnd(seed ^ 0x51ed270b));
    var pal = paletteFor(card);
    var arch = archetypeFor(card);

    /* Archetype drives where the horizon and the light sit. */
    var horizon, lx, ly, lightR, lightStrength, figureX;
    switch (arch) {
      case 'skyline':
        horizon = rnd.range(0.74, 0.8);
        lx = W * rnd.pick([0.22, 0.3, 0.7, 0.78]);
        ly = H * rnd.range(0.66, 0.74);
        lightR = W * 1.05; lightStrength = 1;
        break;
      case 'summit':
        horizon = rnd.range(0.66, 0.72);
        lx = W * rnd.range(0.44, 0.56);
        ly = H * rnd.range(0.24, 0.34);
        lightR = W * 1.15; lightStrength = 1.05;
        break;
      case 'bloom':
        horizon = rnd.range(0.7, 0.78);
        lx = W * rnd.range(0.38, 0.62);
        ly = H * rnd.range(0.4, 0.52);
        lightR = W * 0.95; lightStrength = 0.85;
        break;
      case 'emblem':
        horizon = rnd.range(0.66, 0.74);
        lx = W * 0.5;
        ly = H * 0.52;
        lightR = W * 0.95; lightStrength = 0.7;
        break;
      case 'crystal':
        horizon = rnd.range(0.68, 0.76);
        lx = W * rnd.range(0.42, 0.58);
        ly = H * rnd.range(0.44, 0.56);
        lightR = W * 1.0; lightStrength = 0.8;
        break;
      default: /* pedestal */
        horizon = rnd.range(0.62, 0.7);
        figureX = rnd.range(0.42, 0.58);
        lx = W * (figureX + rnd.pick([-0.02, 0.02]));
        ly = H * rnd.range(0.44, 0.56);
        lightR = W * 1.1; lightStrength = 1;
    }
    if (figureX === undefined) figureX = 0.5;

    /* 1. sky */
    skyWash(ctx, W, H, pal, horizon);

    /* 2. light source behind everything */
    lightSource(ctx, W, H, pal, lx, ly, lightR, lightStrength);

    /* 3. cloud / nebula bands */
    cloudBands(ctx, W, H, pal, rnd, noise, horizon, lx, rnd.int(3, 5));

    /* 4. parallax ridges, far to near */
    var hy = H * horizon;
    var peaky = rnd() < 0.55;
    ridgeLayer(ctx, W, H, {
      noise: noise, phase: rnd() * 100, freq: rnd.range(1.6, 2.8),
      yBase: hy - H * 0.02, amp: H * rnd.range(0.12, 0.2), peak: peaky,
      color: mix(pal.ridge[0], pal.sky[2], 0.26), hazeColor: pal.sky[2], haze: 0.26,
      rim: 0.28, rimColor: pal.halo, lightX: lx
    });
    ridgeLayer(ctx, W, H, {
      noise: noise, phase: rnd() * 100 + 300, freq: rnd.range(2.4, 4),
      yBase: hy + H * 0.06, amp: H * rnd.range(0.1, 0.16), peak: !peaky,
      color: pal.ridge[1], hazeColor: pal.sky[2], haze: 0.1,
      rim: 0.5, rimColor: pal.accent, lightX: lx
    });
    ridgeLayer(ctx, W, H, {
      noise: noise, phase: rnd() * 100 + 700, freq: rnd.range(3.2, 5.5),
      yBase: hy + H * 0.16, amp: H * rnd.range(0.07, 0.12), peak: false,
      color: shade(pal.ridge[2], -0.1), hazeColor: pal.sky[2], haze: 0,
      rim: 0.55, rimColor: pal.accent, lightX: lx
    });

    /* 5. airborne motes BEHIND the subject — the depth cue */
    var drift = rnd.range(-Math.PI * 0.85, -Math.PI * 0.15);
    particles(ctx, W, H, pal, rnd, lx, ly, { density: 1, scale: 1, alpha: 1, drift: drift });

    /* 6. the archetype's subject */
    (ARCH_FN[arch] || archPedestal)(ctx, W, H, {
      pal: pal, rnd: rnd, noise: noise, lx: lx, ly: ly, horizon: horizon, figureX: figureX
    });

    /* 7. a sparse pass in front, so the air reads as volume around the subject */
    particles(ctx, W, H, pal, rnd, lx, ly, { density: 0.34, scale: 1.35, alpha: 0.7, drift: drift });

    /* 8. grade, vignette, grain */
    grade(ctx, W, H, pal, horizon);
    vignette(ctx, W, H, pal);
    grain(ctx, W, H, W < 120 ? 0.05 : 0.1);
  }

  /* ------------------------------------------------------------------ *
   * Public entry point + cache
   * ------------------------------------------------------------------ */

  var cache = Object.create(null);
  var cacheKeys = [];
  var CACHE_MAX = 900;

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function render(card, width, height) {
    var dpr = Math.min((global.devicePixelRatio || 1), 2);
    var cssW = Math.max(1, Math.round(width));
    var cssH = Math.max(1, Math.round(height));
    var devW = Math.max(1, Math.round(cssW * dpr));
    var devH = Math.max(1, Math.round(cssH * dpr));

    /* Supersample small tiles so a 34px thumbnail is a miniature painting, not aliased confetti. */
    var ss = devW < 110 ? 3 : devW < 240 ? 2 : 1;

    var out = makeCanvas(devW, devH);
    out.style.width = cssW + 'px';
    out.style.height = cssH + 'px';
    var octx = out.getContext('2d');

    if (ss === 1) {
      paint(octx, devW, devH, card);
    } else {
      var big = makeCanvas(devW * ss, devH * ss);
      var bctx = big.getContext('2d');
      paint(bctx, devW * ss, devH * ss, card);
      octx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in octx) octx.imageSmoothingQuality = 'high';
      octx.drawImage(big, 0, 0, devW, devH);
    }
    return out;
  }

  /**
   * procArt(card, width, height) -> HTMLCanvasElement
   * Deterministic from card.id. Cached; repeated calls return the same canvas instance.
   */
  RB.procArt = function procArt(card, width, height) {
    var id = String((card && card.id) || 'breachforge');
    var w = Math.max(1, Math.round(width || 34));
    var h = Math.max(1, Math.round(height || Math.round(w * 1.4)));
    var key = id + '|' + w + 'x' + h;
    var hit = cache[key];
    if (hit) return hit;
    var canvas = render(card, w, h);
    cache[key] = canvas;
    cacheKeys.push(key);
    if (cacheKeys.length > CACHE_MAX) {
      var drop = cacheKeys.shift();
      delete cache[drop];
    }
    return canvas;
  };

  /** procArtUrl(card, width, height) -> data URL, for CSS background-image use. */
  RB.procArtUrl = function procArtUrl(card, width, height) {
    return RB.procArt(card, width, height).toDataURL('image/png');
  };

  RB.procArtClearCache = function () {
    cache = Object.create(null);
    cacheKeys = [];
  };

  /* exposed for the scratch harness / tuning only */
  RB.procArtInternals = { getPalettes: getPalettes, archetypeFor: archetypeFor, paletteFor: paletteFor };

})(typeof window !== 'undefined' ? window : this);
