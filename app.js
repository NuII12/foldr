// Foldr: every tool runs in the browser. Libraries are lazy-loaded from jsDelivr only when a tool needs them.
const $ = (s, r = document) => r.querySelector(s);
const h = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const k in a) { const v = a[k]; if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  e.append(...c.flat().filter(x => x != null && x !== false)); return e;
};
class U extends Error {} // user-facing error

// ---------- settings, theme, sound ----------
let S = { theme: 'system', sfx: false, vol: .3, rm: false };
try { Object.assign(S, JSON.parse(localStorage.getItem('prefs') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('prefs', JSON.stringify(S)); } catch {} document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.rm = S.rm; };
let touched = false, ac;
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => touched = true, { once: true });
const sfx = (f = 600, d = .08) => { // soft, short UI blip; silent until enabled AND the user has interacted
  if (!S.sfx || !touched || S.vol <= 0) return;
  ac ??= new AudioContext(); const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = f; g.gain.value = S.vol * .15; g.gain.exponentialRampToValueAtTime(1e-4, ac.currentTime + d);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
};
const toast = m => { const t = h('div', { class: 'toast', role: 'status' }, m); document.body.append(t); setTimeout(() => t.remove(), 2000); };

// ---------- lazy libraries ----------
const CDN = 'https://cdn.jsdelivr.net/npm/';
const lib = {
  pdf: () => import(CDN + 'pdf-lib@1.17.1/+esm'),
  zip: () => import(CDN + 'jszip@3.10.1/+esm').then(m => m.default),
  pdfjs: async () => { const m = await import(CDN + 'pdfjs-dist@4.4.168/build/pdf.min.mjs');
    const w = await fetch(CDN + 'pdfjs-dist@4.4.168/build/pdf.worker.min.mjs').then(r => r.blob());
    m.GlobalWorkerOptions.workerSrc = URL.createObjectURL(w); return m; },
};

// ---------- helpers ----------
const fmt = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.ceil(n / 1e3) + ' KB';
const base = f => f.name.replace(/\.[^.]+$/, '');
const dl = (blob, name) => { const u = URL.createObjectURL(blob); return [u, name]; };
const pages = (s, n) => { if (!s?.trim()) return [...Array(n).keys()]; const o = [];
  for (const p of s.split(',')) { const [a, b = a] = p.trim().split('-').map(Number);
    if (!(a >= 1 && b <= n && a <= b)) throw new U(`"${p.trim()}" is not a valid page range. This PDF has ${n} pages.`);
    for (let i = a; i <= b; i++) o.push(i - 1); } return o; };
const need = (s, what = 'pages') => { if (!s?.trim()) throw new U(`Enter the ${what} to use, for example 1-3,5.`); };
const M = [['l', 'Left %'], ['t', 'Top %'], ['r', 'Right %'], ['b', 'Bottom %']].map(([k, l]) => ({ k, l, t: 'number', v: 0, min: 0, max: 90 }));
const PG = { k: 'p', l: 'Pages (blank = all)', ph: '1-3,5' };

// ---------- image engine (Canvas) ----------
const bmp = async f => { try { return await createImageBitmap(f); } catch { throw new U('This image could not be read. Please try another file.'); } };
const cv = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh));
  if (c.width * c.height > 2.6e8 || c.width > 32000 || c.height > 32000) throw new U('The result is too large for your browser. Choose a smaller size.'); return c; };
const out = (c, f, suf) => new Promise((res, rej) => { const jpg = f.type === 'image/jpeg';
  c.toBlob(b => b ? res({ name: base(f) + suf + (jpg ? '.jpg' : '.png'), blob: b }) : rej(new U('The result is too large to export.')), jpg ? 'image/jpeg' : 'image/png', .92); });
const img = (id, name, desc, icon, fields, fn) => ({ id, cat: 'image', icon, name, desc, accept: 'image/*', fields,
  run: async (f, v) => { const b = await bmp(f[0]); return [await out(await fn(b, v), f[0], '-' + id)]; } });
const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const m = Math.max(r, g, b), n = Math.min(r, g, b), d = m - n, l = (m + n) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let x = !d ? 0 : m === r ? ((g - b) / d) % 6 : m === g ? (b - r) / d + 2 : (r - g) / d + 4; return `hsl(${Math.round((x * 60 + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`; };

// ---------- video engine (MediaRecorder; exports WebM in real time) ----------
async function vid(f, v, c) {
  const el = h('video', { playsinline: '', preload: 'auto' }); el.src = URL.createObjectURL(f);
  await new Promise((ok, no) => { el.onloadedmetadata = ok; el.onerror = () => no(new U('Your browser cannot read this video. Try an MP4 or WebM file.')); });
  const d = el.duration, s = v.s || 0, e = Math.min(v.e || d, d);
  if (!(s < e)) throw new U('The end time must be after the start time.');
  const [L, T, R, B] = [v.l || 0, v.t || 0, v.r || 0, v.b || 0];
  if (L + R > 95 || T + B > 95) throw new U('The crop leaves almost nothing of the video.');
  const W = Math.floor(el.videoWidth * (100 - L - R) / 200) * 2, H = Math.floor(el.videoHeight * (100 - T - B) / 200) * 2;
  const mt = ['video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mt) throw new U('Your browser cannot export video. Try a recent Chrome, Edge or Firefox.');
  const cn = h('canvas', { width: W, height: H }), g = cn.getContext('2d'), st = cn.captureStream(30);
  try { (el.captureStream || el.mozCaptureStream).call(el).getAudioTracks().forEach(t => st.addTrack(t)); } catch {}
  const rec = new MediaRecorder(st, { mimeType: mt }), ch = []; rec.ondataavailable = x => ch.push(x.data);
  const stopped = new Promise(r => rec.onstop = r);
  if (s > 0.01) { el.currentTime = s; await new Promise(r => el.onseeked = r); } rec.start(500); await el.play();
  await new Promise(res => { const tick = () => { g.drawImage(el, el.videoWidth * L / 100, el.videoHeight * T / 100, W, H, 0, 0, W, H);
    c.progress((el.currentTime - s) / (e - s)); if (el.currentTime >= e || el.ended) { el.pause(); res(); } else requestAnimationFrame(tick); }; tick(); });
  rec.stop(); await stopped; URL.revokeObjectURL(el.src);
  return [{ name: base(f) + '-edited.webm', blob: new Blob(ch, { type: 'video/webm' }) }];
}

// ---------- PDF engine (pdf-lib) ----------
const ld = async (P, f) => { try { return await P.load(await f.arrayBuffer()); }
  catch (e) { throw new U(/encrypt/i.test(e.message) ? 'This PDF is password-protected and cannot be edited here.' : 'This PDF looks invalid or corrupted. Please try another file.'); } };
const sv = async (d, n) => ({ name: n, blob: new Blob([await d.save()], { type: 'application/pdf' }) });
const sub = async (P, f, idx) => { const s = await ld(P, f), d = await P.create(); (await d.copyPages(s, idx)).forEach(p => d.addPage(p)); return d; };
const pdf = (id, name, desc, icon, fields, fn, o = {}) => ({ id, cat: 'pdf', icon, name, desc, accept: 'application/pdf', fields, ...o,
  run: async (fs, v, c) => fn(await lib.pdf(), fs, v, c) });
const inPlace = (fn) => async (L, fs, v) => { const d = await ld(L.PDFDocument, fs[0]); fn(d, pages(v.p, d.getPageCount()), v, L); return [await sv(d, base(fs[0]) + '-edited.pdf')]; };
const SIZES = { a4: [595.28, 841.89], a3: [841.89, 1190.55], letter: [612, 792], legal: [612, 1008] };

// ---------- audio engine (Web Audio decode + WAV / lamejs MP3 encode) ----------
const mkBuf = (b, len) => new AudioBuffer({ length: Math.max(1, len), numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
const mapCh = (b, len, fn) => { const o = mkBuf(b, len); for (let c = 0; c < b.numberOfChannels; c++) o.copyToChannel(fn(b.getChannelData(c)), c); return o; };
const clip = x => Math.max(-1, Math.min(1, x));
const wav = b => { const n = b.length, ch = b.numberOfChannels, buf = new ArrayBuffer(44 + n * ch * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const d = [...Array(ch).keys()].map(i => b.getChannelData(i)); let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setInt16(o, clip(d[c][i]) * 32767, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' }); };
const mp3 = async b => { await new Promise((ok, no) => { if (window.lamejs) return ok(); const s = document.createElement('script'); s.src = CDN + 'lamejs@1.2.1/lame.min.js'; s.onload = ok;
    s.onerror = () => no(new U('Could not load the MP3 encoder. Check your connection or choose WAV.')); document.head.append(s); });
  const ch = Math.min(2, b.numberOfChannels), e = new lamejs.Mp3Encoder(ch, b.sampleRate, 128), to = x => Int16Array.from(x, s => clip(s) * 32767), L = to(b.getChannelData(0)), R = ch > 1 ? to(b.getChannelData(1)) : null, o = [];
  for (let i = 0; i < L.length; i += 1152) o.push(R ? e.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)) : e.encodeBuffer(L.subarray(i, i + 1152))); o.push(e.flush()); return new Blob(o, { type: 'audio/mpeg' }); };
const aud = (id, name, desc, icon, fields, fn) => ({ id, cat: 'audio', icon, name, desc, accept: 'audio/*', kw: 'sound music mp3 wav', fields: [...fields, { k: 'fmt', l: 'Output format', o: [['wav', 'WAV'], ['mp3', 'MP3']] }],
  run: async (f, v, c) => { let b; try { b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await f[0].arrayBuffer()); } catch { throw new U('This audio file could not be decoded. Try MP3, WAV, OGG or M4A.'); }
    c.progress(.3); const o = fn(b, v); c.progress(.6); return [{ name: base(f[0]) + '-' + id + '.' + v.fmt, blob: v.fmt === 'mp3' ? await mp3(o) : wav(o) }]; } });
const rng = (b, v) => { const a = Math.round((v.s || 0) * b.sampleRate), e = Math.min(b.length, Math.round((v.e ?? b.duration) * b.sampleRate)); if (!(a < e)) throw new U(`The end time must be after the start time (this file is ${b.duration.toFixed(1)} s long).`); return [a, e]; };
const TS = [{ k: 's', l: 'Start (seconds)', t: 'number', v: 0, min: 0 }, { k: 'e', l: 'End (seconds, blank = end)', t: 'number', min: 0 }];

// ---------- stamping engine for Edit / Annotate / E-sign ----------
const col = (L, s) => L.rgb(...[1, 3, 5].map(i => parseInt((s || '#000000').slice(i, i + 2), 16) / 255));
const png = async f => { const b = await bmp(f), c = cv(b.width, b.height); c.getContext('2d').drawImage(b, 0, 0); return new Uint8Array(await (await new Promise(r => c.toBlob(r))).arrayBuffer()); };
const stamp = async (L, fs, v, k) => { const d = await ld(L.PDFDocument, fs[0]), i = (v.pg || 1) - 1; if (i < 0 || i >= d.getPageCount()) throw new U(`Page ${v.pg} does not exist. This PDF has ${d.getPageCount()} pages.`);
  const p = d.getPage(i), { width: W, height: H } = p.getSize(), w = W * (v.w || 20) / 100, hh = H * (v.h || 8) / 100, x = W * (v.x || 0) / 100, y = H - H * (v.y || 0) / 100 - hh, c = col(L, v.c), o = { color: c, opacity: .3, borderColor: c, borderWidth: 1 };
  if (k === 'text' || k === 'note') { need(v.t, 'text'); p.drawText(v.t, { x, y: y + hh * .2, size: v.sz || 16, color: c }); }
  else if (k === 'image') { if (!v.img) throw new U('Choose an image or signature first.'); const im = await d.embedPng(await png(v.img)), s = Math.min(w / im.width, hh / im.height); p.drawImage(im, { x, y, width: im.width * s, height: im.height * s }); }
  else if (k === 'rectangle' || k === 'highlight') p.drawRectangle({ x, y, width: w, height: hh, ...o, opacity: k === 'highlight' ? .35 : .25 });
  else if (k === 'ellipse') p.drawEllipse({ x: x + w / 2, y: y + hh / 2, xScale: w / 2, yScale: hh / 2, ...o });
  else if (k === 'line') p.drawLine({ start: { x, y: y + hh }, end: { x: x + w, y }, thickness: 2, color: c });
  return [await sv(d, base(fs[0]) + '-edited.pdf')]; };
const POS = [{ k: 'pg', l: 'Page', t: 'number', v: 1, min: 1 }, { k: 'x', l: 'Left (% of page)', t: 'number', v: 10, min: 0, max: 100 }, { k: 'y', l: 'Top (% of page)', t: 'number', v: 10, min: 0, max: 100 },
  { k: 'w', l: 'Width (%)', t: 'number', v: 30, min: 1, max: 100 }, { k: 'h', l: 'Height (%)', t: 'number', v: 8, min: 1, max: 100 }];
const pad = k => { const c = h('canvas', { width: 400, height: 140, 'data-k': k, 'aria-label': 'Draw your signature here', style: 'background:#fff;border:1px solid var(--bd);border-radius:10px;touch-action:none;max-width:100%' }), g = c.getContext('2d'); let d = 0;
  g.lineWidth = 3; g.lineCap = 'round'; g.strokeStyle = '#111'; const p = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = e => { d = 1; c.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...p(e)); }; c.onpointermove = e => { if (d) { g.lineTo(...p(e)); g.stroke(); c.dirty = 1; } }; c.onpointerup = () => d = 0; return c; };

const EXTRA = [
  aud('audio-converter', 'Audio Converter', 'Convert audio between MP3 and WAV (reads MP3, WAV, OGG, M4A, FLAC).', '🔁', [], b => b),
  aud('audio-trimmer', 'Audio Trimmer', 'Keep only the section of audio you need.', '✂️', TS, (b, v) => { const [a, e] = rng(b, v); return mapCh(b, e - a, d => d.slice(a, e)); }),
  aud('audio-cutter', 'Audio Cutter', 'Cut a section out of the middle of a track.', '🪚', TS.map(f => ({ ...f, l: f.l.replace('Start', 'Cut from').replace('End', 'Cut to') })), (b, v) => { const [a, e] = rng(b, v);
    if (a === 0 && e >= b.length) throw new U('That would remove the whole track.'); return mapCh(b, b.length - (e - a), d => { const o = new Float32Array(d.length - (e - a)); o.set(d.subarray(0, a)); o.set(d.subarray(e), a); return o; }); }),
  aud('audio-speed', 'Audio Speed Changer', 'Speed audio up or slow it down (pitch changes with speed).', '⏩', [{ k: 'x', l: 'Speed (0.25 to 4)', t: 'number', v: 1.5, min: .25, max: 4 }], (b, v) => { const x = v.x || 1;
    if (x < .25 || x > 4) throw new U('Speed must be between 0.25 and 4.'); return mapCh(b, Math.floor(b.length / x), d => { const o = new Float32Array(Math.floor(d.length / x));
      for (let i = 0; i < o.length; i++) { const p = i * x, j = Math.floor(p), f = p - j; o[i] = d[j] * (1 - f) + (d[j + 1] ?? d[j]) * f; } return o; }); }),
  aud('audio-volume', 'Audio Volume Changer', 'Make audio louder or quieter in decibels.', '🔊', [{ k: 'db', l: 'Change (dB, negative = quieter)', t: 'number', v: 6, min: -60, max: 40 }, { k: 'safe', l: 'Prevent clipping', t: 'checkbox', v: true }], (b, v) => {
    let g = 10 ** ((v.db || 0) / 20); if (v.safe) { let pk = 0; for (let c = 0; c < b.numberOfChannels; c++) for (const s of b.getChannelData(c)) pk = Math.max(pk, Math.abs(s)); if (pk * g > 1) g = 1 / pk; }
    return mapCh(b, b.length, d => d.map(s => clip(s * g))); }),
  aud('audio-reverse', 'Audio Reverser', 'Play a track backwards.', '⏪', [], b => mapCh(b, b.length, d => d.slice().reverse())),

  { id: 'gif-maker', cat: 'image', icon: '🎞️', name: 'GIF Maker', desc: 'Turn several images into an animated GIF. Reorder with the arrows.', accept: 'image/*', multi: true, min: 2, kw: 'animation frames',
    fields: [{ k: 'd', l: 'Frame duration (ms)', t: 'number', v: 300, min: 20 }, { k: 'w', l: 'Width (px)', t: 'number', v: 480, min: 16, max: 1200 }, { k: 'lp', l: 'Loop forever', t: 'checkbox', v: true }],
    run: async (fs, v, c) => { const { GIFEncoder: G, quantize: q, applyPalette: a } = await import(CDN + 'gifenc@1.0.3/+esm'), e = G(); let W, H;
      for (const [i, f] of fs.entries()) { const b = await bmp(f); W ??= Math.round(v.w || 480); H ??= Math.round(W * b.height / b.width); const cn = cv(W, H), g = cn.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
        const s = Math.min(W / b.width, H / b.height); g.drawImage(b, (W - b.width * s) / 2, (H - b.height * s) / 2, b.width * s, b.height * s); const d = g.getImageData(0, 0, W, H).data, p = q(d, 256);
        e.writeFrame(a(d, p), W, H, { palette: p, delay: v.d || 300, repeat: v.lp ? 0 : -1 }); c.progress((i + 1) / fs.length); }
      e.finish(); return [{ name: 'animation.gif', blob: new Blob([e.bytes()], { type: 'image/gif' }) }]; } },
  { id: 'extract-pdf-images', cat: 'pdf', icon: '🖼️', name: 'Extract Image from PDF', desc: 'Save every image embedded in a PDF (PNG, ZIP for many).', accept: 'application/pdf', fields: [], kw: 'pictures photos',
    run: async (fs, v, c) => { const j = await lib.pdfjs(); let doc; try { doc = await j.getDocument({ data: await fs[0].arrayBuffer() }).promise; } catch { throw new U('This PDF could not be opened. It may be corrupted or password-protected.'); }
      const o = [], seen = new Set(); for (let n = 1; n <= doc.numPages; n++) { const pg = await doc.getPage(n), ops = await pg.getOperatorList(); c.progress(n / doc.numPages);
        for (let i = 0; i < ops.fnArray.length; i++) { if (ops.fnArray[i] !== j.OPS.paintImageXObject) continue; const id = ops.argsArray[i][0]; if (seen.has(id)) continue; seen.add(id);
          const im = await new Promise(r => (id.startsWith('g_') ? pg.commonObjs : pg.objs).get(id, r)); if (!im?.width) continue; const cn = cv(im.width, im.height), g = cn.getContext('2d');
          if (im.bitmap) g.drawImage(im.bitmap, 0, 0); else { const px = new Uint8ClampedArray(im.width * im.height * 4); if (im.kind === 3) px.set(im.data); else if (im.kind === 2) for (let k = 0, m = 0; k < im.data.length; k += 3, m += 4) { px.set(im.data.subarray(k, k + 3), m); px[m + 3] = 255; } else continue;
            g.putImageData(new ImageData(px, im.width, im.height), 0, 0); }
          o.push({ name: `${base(fs[0])}-p${n}-${o.length + 1}.png`, blob: await new Promise(r => cn.toBlob(r)) }); } }
      if (!o.length) throw new U('No extractable images were found in this PDF.'); return o; } },
  { id: 'unlock-pdf', cat: 'pdf', icon: '🔓', name: 'Unlock PDF', desc: 'Remove a password (you must know it). Pages are re-saved as images, so text is not selectable.', accept: 'application/pdf', kw: 'password decrypt',
    fields: [{ k: 'pw', l: 'Password', t: 'password' }], run: async (fs, v, c) => { const [j, L] = await Promise.all([lib.pdfjs(), lib.pdf()]); let doc;
      try { doc = await j.getDocument({ data: await fs[0].arrayBuffer(), password: v.pw || '' }).promise; } catch (e) { throw new U(e.name === 'PasswordException' ? (v.pw ? 'That password is incorrect.' : 'This PDF needs a password. Enter it above.') : 'This PDF could not be opened.'); }
      const d = await L.PDFDocument.create(); for (let n = 1; n <= doc.numPages; n++) { const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 2 }), cn = cv(vp.width, vp.height), g = cn.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cn.width, cn.height);
        await pg.render({ canvasContext: g, viewport: vp }).promise; const im = await d.embedJpg(new Uint8Array(await (await new Promise(r => cn.toBlob(r, 'image/jpeg', .9))).arrayBuffer())); d.addPage([vp.width / 2, vp.height / 2]).drawImage(im, { x: 0, y: 0, width: vp.width / 2, height: vp.height / 2 }); c.progress(n / doc.numPages); }
      return [await sv(d, base(fs[0]) + '-unlocked.pdf')]; } },
  { id: 'protect-pdf', cat: 'pdf', icon: '🔒', name: 'Protect PDF', desc: 'Lock a PDF with a password.', accept: 'application/pdf', kw: 'password encrypt secure',
    fields: [{ k: 'p1', l: 'Password', t: 'password' }, { k: 'p2', l: 'Confirm password', t: 'password' }], run: async (fs, v) => { if (!v.p1) throw new U('Enter a password.'); if (v.p1 !== v.p2) throw new U('The passwords do not match.');
      const m = await import(CDN + 'pdf-lib-plus-encrypt@1.1.0/+esm'), P = (m.PDFDocument || m.default.PDFDocument), d = await ld(P, fs[0]); await d.encrypt({ userPassword: v.p1, ownerPassword: v.p1, permissions: { printing: 'highResolution', copying: true } });
      return [await sv(d, base(fs[0]) + '-protected.pdf')]; } },
  pdf('edit-pdf', 'Edit PDF', 'Add text, images and shapes to a page.', '✏️', [{ k: 'k', l: 'Add', o: [['text', 'Text'], ['image', 'Image'], ['rectangle', 'Rectangle'], ['ellipse', 'Ellipse']] }, ...POS,
    { k: 't', l: 'Text', ph: 'Hello' }, { k: 'sz', l: 'Text size', t: 'number', v: 16, min: 4 }, { k: 'c', l: 'Color', t: 'color', v: '#d00000' }, { k: 'img', l: 'Image (for Image)', t: 'file' }], (L, fs, v) => stamp(L, fs, v, v.k)),
  pdf('annotate-pdf', 'Annotate PDF', 'Highlight, draw shapes and lines, or add notes.', '🖍️', [{ k: 'k', l: 'Annotation', o: [['highlight', 'Highlight'], ['rectangle', 'Rectangle'], ['ellipse', 'Ellipse'], ['line', 'Line'], ['note', 'Text note']] }, ...POS,
    { k: 't', l: 'Note text', ph: 'Check this' }, { k: 'sz', l: 'Note size', t: 'number', v: 12, min: 4 }, { k: 'c', l: 'Color', t: 'color', v: '#ffd400' }], (L, fs, v) => stamp(L, fs, v, v.k)),
  pdf('e-sign', 'E-sign PDF', 'Draw, type or upload a signature and place it on a page.', '🖊️', [{ k: 'sig', l: 'Draw signature', t: 'pad' }, { k: 'tn', l: 'Or type your name', ph: 'Jane Doe' }, { k: 'img', l: 'Or upload a signature image', t: 'file' }, ...POS],
    async (L, fs, v) => { let src = v.sig ? await (await fetch(v.sig)).blob() : v.img; if (!src && v.tn?.trim()) { const c = cv(700, 180), g = c.getContext('2d'); g.font = 'italic 100px "Segoe Script","Brush Script MT",cursive'; g.fillStyle = '#111'; g.textBaseline = 'middle'; g.fillText(v.tn, 20, 90, 660); src = await new Promise(r => c.toBlob(r)); }
      if (!src) throw new U('Draw, type or upload a signature first.'); return stamp(L, fs, { ...v, img: src }, 'image'); }),
  pdf('create-fillable-pdf', 'Create Fillable PDF', 'Add text fields, checkboxes, radio buttons and dropdowns.', '📝', [{ k: 'f', l: 'Fields, one per line: type,name,page,left%,top%,width%,height%[,options]', t: 'area',
    ph: 'text,fullname,1,10,10,40,4\ncheckbox,agree,1,10,20,3,3\nradio,size,1,10,30,3,3\nradio,size,1,20,30,3,3\ndropdown,country,1,10,40,30,4,France|Belgium' }], async (L, fs, v) => {
    need(v.f, 'field lines'); const d = await ld(L.PDFDocument, fs[0]), fm = d.getForm(), rg = {};
    for (const [n, ln] of v.f.split('\n').filter(s => s.trim()).entries()) { const [t, nm, pg, x, y, w, hh, op] = ln.split(',').map(s => s.trim()), p = d.getPage((+pg || 1) - 1); if (!p || !nm) throw new U(`Line ${n + 1} is not valid.`);
      const { width: W, height: H } = p.getSize(), pos = { x: W * x / 100, y: H - H * y / 100 - H * hh / 100, width: W * w / 100, height: H * hh / 100 };
      if (t === 'text' || t === 'signature') fm.createTextField(nm).addToPage(p, pos); else if (t === 'checkbox') fm.createCheckBox(nm).addToPage(p, pos);
      else if (t === 'radio') (rg[nm] ??= fm.createRadioGroup(nm)).addOptionToPage('option' + n, p, pos); else if (t === 'dropdown') { const f = fm.createDropdown(nm); f.addOptions((op || 'Option').split('|')); f.addToPage(p, pos); }
      else throw new U(`Line ${n + 1}: unknown field type "${t}".`); }
    return [await sv(d, base(fs[0]) + '-fillable.pdf')]; }),
];

// ---------- tool registry ----------
const T = [
  { id: 'crop-video', cat: 'video', icon: '🎬', name: 'Crop Video', desc: 'Cut away the edges of a video.', accept: 'video/*', fields: M, run: (f, v, c) => vid(f[0], v, c) },
  { id: 'trim-video', cat: 'video', icon: '✂️', name: 'Trim Video', desc: 'Keep only the part of a video you need.', accept: 'video/*', kw: 'cut clip',
    fields: [{ k: 's', l: 'Start (seconds)', t: 'number', v: 0, min: 0 }, { k: 'e', l: 'End (seconds, blank = end)', t: 'number', min: 0 }], run: (f, v, c) => vid(f[0], v, c) },
  img('resize-image', 'Resize Image', 'Change the width and height of an image.', '📐', [
    { k: 'pre', l: 'Preset', o: [['', 'Custom'], ['1920x1080', '1920 × 1080'], ['1280x720', '1280 × 720'], ['1080x1080', '1080 × 1080'], ['512x512', '512 × 512']] },
    { k: 'w', l: 'Width (px)', t: 'number', min: 1 }, { k: 'h', l: 'Height (px)', t: 'number', min: 1 }, { k: 'lock', l: 'Lock aspect ratio', t: 'checkbox', v: true }],
    (b, v) => { let w = v.w || b.width, hh = v.h || b.height; if (v.pre) [w, hh] = v.pre.split('x').map(Number);
      else if (v.lock) { if (v.w) hh = b.height * w / b.width; else if (v.h) w = b.width * hh / b.height; }
      const c = cv(w, hh); c.getContext('2d').drawImage(b, 0, 0, c.width, c.height); return c; }),
  img('crop-image', 'Crop Image', 'Trim an image by percentage from each edge.', '🔲', M, (b, v) => {
    const x = b.width * v.l / 100, y = b.height * v.t / 100, w = b.width * (1 - (v.l + v.r) / 100), hh = b.height * (1 - (v.t + v.b) / 100);
    if (w < 1 || hh < 1) throw new U('The crop leaves nothing of the image.'); const c = cv(w, hh); c.getContext('2d').drawImage(b, x, y, w, hh, 0, 0, c.width, c.height); return c; }),
  { id: 'color-picker', cat: 'image', icon: '🎨', name: 'Color Picker', desc: 'Click any pixel to get its HEX, RGB and HSL.', accept: 'image/*', kw: 'eyedropper colour',
    view: async (f, box) => { const b = await bmp(f), c = h('canvas', { width: b.width, height: b.height, class: 'pick' }), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(b, 0, 0); const sw = h('div', { class: 'sw' }), info = h('div', { role: 'status' }, h('p', {}, 'Click the image to pick a color.'));
      c.onclick = e => { const r = c.getBoundingClientRect(), [R, G, B] = g.getImageData(Math.floor((e.clientX - r.left) * c.width / r.width), Math.floor((e.clientY - r.top) * c.height / r.height), 1, 1).data;
        const hex = '#' + [R, G, B].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase(); sw.style.background = hex; sfx(700);
        info.replaceChildren(...[hex, `rgb(${R}, ${G}, ${B})`, hsl(R, G, B)].map(t => h('div', { class: 'row' }, h('code', {}, t), h('button', { class: 'btn sm', onclick: () => navigator.clipboard.writeText(t).then(() => toast('Copied ' + t)) }, 'Copy')))); };
      box.append(c, sw, info); } },
  img('rotate-image', 'Rotate Image', 'Rotate by 90°, 180° or any angle.', '🔄', [
    { k: 'a', l: 'Rotation', o: [['90', '90° right'], ['-90', '90° left'], ['180', '180°'], ['0', 'Custom only']] }, { k: 'x', l: 'Extra angle (°)', t: 'number', v: 0 }],
    (b, v) => { const a = (+v.a + (v.x || 0)) * Math.PI / 180, s = Math.abs(Math.sin(a)), co = Math.abs(Math.cos(a)), c = cv(b.width * co + b.height * s, b.width * s + b.height * co), g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2); g.rotate(a); g.drawImage(b, -b.width / 2, -b.height / 2); return c; }),
  img('flip-image', 'Flip Image', 'Mirror an image horizontally or vertically.', '↔️', [{ k: 'd', l: 'Direction', o: [['h', 'Horizontal'], ['v', 'Vertical'], ['b', 'Both']] }],
    (b, v) => { const c = cv(b.width, b.height), g = c.getContext('2d'); g.translate(v.d !== 'v' ? b.width : 0, v.d !== 'h' ? b.height : 0);
      g.scale(v.d !== 'v' ? -1 : 1, v.d !== 'h' ? -1 : 1); g.drawImage(b, 0, 0); return c; }),
  img('image-enlarger', 'Image Enlarger', 'Upscale an image 2×, 4× or 8× with smooth resampling.', '🔍', [{ k: 'x', l: 'Scale', o: [['2', '2×'], ['4', '4×'], ['8', '8×']] }],
    (b, v) => { const c = cv(b.width * v.x, b.height * v.x), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(b, 0, 0, c.width, c.height); return c; }),

  pdf('pdf-merge', 'PDF Merge', 'Combine several PDFs into one.', '🧩', [], async (L, fs) => { const d = await L.PDFDocument.create();
    for (const f of fs) { const s = await ld(L.PDFDocument, f); (await d.copyPages(s, s.getPageIndices())).forEach(p => d.addPage(p)); }
    return [await sv(d, 'merged.pdf')]; }, { multi: true, min: 2, kw: 'combine join' }),
  pdf('pdf-split', 'PDF Split', 'Split a PDF into several files.', '✂️', [{ k: 'r', l: 'Ranges (blank = every page)', ph: '1-3,4,5-8' }], async (L, fs, v) => {
    const n = (await ld(L.PDFDocument, fs[0])).getPageCount(), gs = v.r?.trim() ? v.r.split(',').map(g => pages(g, n)) : [...Array(n).keys()].map(i => [i]);
    return Promise.all(gs.map(async (g, i) => sv(await sub(L.PDFDocument, fs[0], g), `${base(fs[0])}-part${i + 1}.pdf`))); }),
  pdf('pdf-page-remover', 'PDF Page Remover', 'Delete pages from a PDF.', '🗑️', [{ ...PG, l: 'Pages to delete', ph: '2,4-5' }], async (L, fs, v) => {
    need(v.p, 'pages to delete'); const n = (await ld(L.PDFDocument, fs[0])).getPageCount(), del = new Set(pages(v.p, n)), keep = [...Array(n).keys()].filter(i => !del.has(i));
    if (!keep.length) throw new U('You cannot delete every page.'); return [await sv(await sub(L.PDFDocument, fs[0], keep), base(fs[0]) + '-trimmed.pdf')]; }),
  pdf('extract-pages', 'Extract Pages from PDF', 'Pull selected pages into a new PDF.', '📑', [{ ...PG, l: 'Pages to extract', ph: '1-3,7' }], async (L, fs, v) => {
    need(v.p, 'pages to extract'); const n = (await ld(L.PDFDocument, fs[0])).getPageCount(); return [await sv(await sub(L.PDFDocument, fs[0], pages(v.p, n)), base(fs[0]) + '-extract.pdf')]; }),
  pdf('rotate-pdf', 'Rotate PDF', 'Rotate all or some pages of a PDF.', '🔄', [{ k: 'a', l: 'Rotation', o: [['90', '90° right'], ['180', '180°'], ['270', '90° left']] }, PG],
    inPlace((d, sel, v, L) => sel.forEach(i => { const p = d.getPage(i); p.setRotation(L.degrees((p.getRotation().angle + +v.a) % 360)); }))),
  pdf('organize-pdf', 'Organize PDF', 'Reorder, duplicate or drop pages by writing the new order.', '🗂️', [{ k: 'p', l: 'New page order', ph: '3,1,2,2 (omitted pages are removed)' }], async (L, fs, v) => {
    need(v.p, 'new page order'); const n = (await ld(L.PDFDocument, fs[0])).getPageCount(); return [await sv(await sub(L.PDFDocument, fs[0], pages(v.p, n)), base(fs[0]) + '-organized.pdf')]; }),
  pdf('resize-pdf', 'Resize PDF', 'Change the page size, scaling content to fit.', '📏', [
    { k: 'z', l: 'Page size', o: [['a4', 'A4'], ['a3', 'A3'], ['letter', 'Letter'], ['legal', 'Legal'], ['c', 'Custom']] }, { k: 'w', l: 'Custom width (pt)', t: 'number', min: 50 }, { k: 'hh', l: 'Custom height (pt)', t: 'number', min: 50 }, PG],
    inPlace((d, sel, v) => { const [W, H] = v.z === 'c' ? [v.w, v.hh] : SIZES[v.z]; if (!W || !H) throw new U('Enter a custom width and height.');
      sel.forEach(i => { const p = d.getPage(i), { width: ow, height: oh } = p.getSize(), s = Math.min(W / ow, H / oh); p.scaleContent(s, s); p.translateContent((W - ow * s) / 2, (H - oh * s) / 2); p.setSize(W, H); }); })),
  pdf('crop-pdf', 'Crop PDF', 'Trim margins from PDF pages.', '🔲', [...M, PG],
    inPlace((d, sel, v) => sel.forEach(i => { const p = d.getPage(i), { width: w, height: hh } = p.getSize(), x = w * v.l / 100, y = hh * v.b / 100, cw = w * (1 - (v.l + v.r) / 100), ch = hh * (1 - (v.t + v.b) / 100);
      if (cw < 10 || ch < 10) throw new U('The crop leaves nothing of the page.'); p.setCropBox(x, y, cw, ch); p.setMediaBox(x, y, cw, ch); }))),
  pdf('flatten-pdf', 'Flatten PDF', 'Turn form fields into fixed page content.', '🧱', [], async (L, fs) => { const d = await ld(L.PDFDocument, fs[0]); d.getForm().flatten(); return [await sv(d, base(fs[0]) + '-flattened.pdf')]; }),
  { id: 'pdf-reader', cat: 'pdf', icon: '📖', name: 'PDF Reader', desc: 'Read PDFs with zoom, search and fullscreen.', accept: 'application/pdf', kw: 'view open',
    view: async (f, box) => { const j = await lib.pdfjs(); let doc; try { doc = await j.getDocument({ data: await f.arrayBuffer() }).promise; } catch { throw new U('This PDF could not be opened. It may be corrupted or password-protected.'); }
      let n = 1, z = 1.2; const N = doc.numPages, cn = h('canvas'), wrap = h('div', { class: 'scroll' }, cn), res = h('span', { role: 'status' }),
        inp = h('input', { type: 'number', min: 1, max: N, value: 1, 'aria-label': 'Page number' }), q = h('input', { type: 'search', placeholder: 'Search text', 'aria-label': 'Search in PDF' });
      const draw = async () => { const p = await doc.getPage(n), r = devicePixelRatio, vp = p.getViewport({ scale: z * r }); cn.width = vp.width; cn.height = vp.height; cn.style.width = vp.width / r + 'px';
        cn.style.maxWidth = 'none'; await p.render({ canvasContext: cn.getContext('2d'), viewport: vp }).promise; inp.value = n; wrap.scrollTop = 0; };
      const go = i => { n = Math.min(N, Math.max(1, i || 1)); draw(); }, zoom = d => { z = Math.min(4, Math.max(.3, z + d)); draw(); };
      const b = (t, l, fn) => h('button', { class: 'btn sm', 'aria-label': l, onclick: fn }, t);
      inp.onchange = () => go(+inp.value);
      q.onchange = async () => { const k = q.value.toLowerCase(); if (!k) return; for (let i = 0; i < N; i++) { const pg = (n + i) % N + 1, tx = (await (await doc.getPage(pg)).getTextContent()).items.map(x => x.str).join(' ').toLowerCase();
        if (tx.includes(k)) { go(pg); res.textContent = `Found on page ${pg}`; return; } } res.textContent = 'No match found'; };
      const fit = async () => { const p = await doc.getPage(n); z = (wrap.clientWidth - 24) / p.getViewport({ scale: 1 }).width; draw(); };
      const [u] = dl(f); box.append(h('div', { class: 'bar' }, b('‹', 'Previous page', () => go(n - 1)), inp, h('span', {}, '/ ' + N), b('›', 'Next page', () => go(n + 1)), b('−', 'Zoom out', () => zoom(-.2)), b('+', 'Zoom in', () => zoom(.2)),
        b('Fit', 'Fit to width', fit), b('Fullscreen', 'Fullscreen', () => wrap.requestFullscreen?.()), h('a', { class: 'btn sm', href: u, download: f.name }, 'Download'), q, res), wrap); fit(); } },
  ...EXTRA,
];

// ---------- UI ----------
const CATS = { video: ['🎬', 'Video Tools'], image: ['🖼️', 'Image Tools'], audio: ['🎧', 'Audio Tools'], pdf: ['📄', 'PDF Tools'] };
const app = $('#app'), dlg = $('#dlg');
const recent = () => { try { return JSON.parse(localStorage.getItem('recent') || '[]'); } catch { return []; } };
const card = t => h('a', { class: 'card', href: '#/t/' + t.id }, h('span', { class: 'ic', 'aria-hidden': 'true' }, t.icon), h('b', {}, t.name), h('small', {}, t.desc));
const grid = ts => h('div', { class: 'grid' }, ts.map(card));
const openDlg = (...c) => { dlg.replaceChildren(...c); dlg.showModal(); sfx(520); };
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => sfx(420));

function toolPage(t) {
  let files = [], urls = []; const root = h('section', { class: 'tool' }, h('div', { class: 'th' }, h('h1', {}, t.icon + ' ' + t.name), h('p', {}, t.desc)));
  const body = h('div'), msg = h('div', { class: 'err', role: 'alert', hidden: '' }); root.append(body, msg);
  const err = m => { msg.textContent = m || ''; msg.hidden = !m; if (m) sfx(200, .15); };
  const reset = () => { urls.forEach(URL.revokeObjectURL); urls = []; files = []; err(''); render(); };
  const okType = f => t.accept === 'application/pdf' ? f.type === 'application/pdf' || /\.pdf$/i.test(f.name) : f.type.startsWith(t.accept.slice(0, -1)) || (t.cat === 'audio' && /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba)$/i.test(f.name));
  const add = async l => { err(''); const max = t.cat === 'video' ? 5e8 : 1.5e8;
    for (const f of l) { if (!okType(f)) return err(`"${f.name}" is not a supported file. Please choose ${t.accept.split('/')[0] === 'application' ? 'a PDF' : 'an ' + t.accept.split('/')[0]} file.`);
      if (f.size > max) return err(`"${f.name}" is too large (limit ${fmt(max)}).`); if (!f.size) return err(`"${f.name}" is empty.`); }
    files = t.multi ? [...files, ...l] : [l[0]]; sfx(660); render(); };
  const fld = f => h('label', { class: 'fld' }, h('span', {}, f.l), f.o ? h('select', { 'data-k': f.k }, f.o.map(([v, l]) => h('option', { value: v }, l)))
    : f.t === 'area' ? h('textarea', { 'data-k': f.k, rows: 6, placeholder: f.ph }) : f.t === 'pad' ? pad(f.k) : h('input', { 'data-k': f.k, type: f.t || 'text', value: f.v, min: f.min, max: f.max, placeholder: f.ph, checked: f.t === 'checkbox' && f.v }));
  const opts = () => { const v = {}; root.querySelectorAll('[data-k]').forEach(i => v[i.dataset.k] = i.tagName === 'CANVAS' ? (i.dirty ? i.toDataURL() : undefined) : i.type === 'file' ? i.files[0] : i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? undefined : +i.value) : i.value); return v; };

  function drop() {
    const inp = h('input', { type: 'file', accept: t.accept, multiple: t.multi ? '' : null, onchange: () => inp.files.length && add([...inp.files]) });
    const z = h('label', { class: 'drop', tabindex: '0', role: 'button', onkeydown: e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inp.click()),
      ondragover: e => { e.preventDefault(); if (!z.classList.contains('over')) { z.classList.add('over'); sfx(480, .05); } }, ondragleave: () => z.classList.remove('over'),
      ondrop: e => { e.preventDefault(); z.classList.remove('over'); e.dataTransfer.files.length && add([...e.dataTransfer.files]); } },
      h('b', {}, 'Drag & drop ' + (t.multi ? 'files' : 'a file') + ' here'), h('span', {}, 'or'), h('span', { class: 'btn primary' }, 'Choose ' + (t.multi ? 'files' : 'file')),
      h('small', {}, 'Processed on your device. Nothing is uploaded.'), inp);
    return z;
  }
  function list() {
    const preview = !t.multi && (files[0].type.startsWith('image/') ? h('img', { class: 'prev', alt: 'Preview of ' + files[0].name }) : files[0].type.startsWith('video/') ? h('video', { class: 'prev', controls: '' }) : t.cat === 'audio' ? h('audio', { controls: '', style: 'width:100%;margin-bottom:12px' }) : null);
    if (preview) { const u = URL.createObjectURL(files[0]); urls.push(u); preview.src = u; }
    const mv = (i, d) => { [files[i], files[i + d]] = [files[i + d], files[i]]; render(); };
    return h('div', {}, preview, h('ul', { class: 'files' }, files.map((f, i) => h('li', {}, h('span', { class: 'n' }, f.name), h('small', {}, fmt(f.size)),
      t.multi && h('button', { class: 'btn sm', 'aria-label': 'Move up', disabled: i ? null : '', onclick: () => mv(i, -1) }, '↑'),
      t.multi && h('button', { class: 'btn sm', 'aria-label': 'Move down', disabled: i < files.length - 1 ? null : '', onclick: () => mv(i, 1) }, '↓'),
      h('button', { class: 'btn sm', 'aria-label': 'Remove ' + f.name, onclick: () => { files.splice(i, 1); render(); } }, '✕')))));
  }
  async function go(btn) {
    err(''); const v = opts(), prog = h('progress', { max: 1, 'aria-label': 'Processing progress' }), st = h('p', { role: 'status' }, 'Processing… keep this tab open.');
    btn.disabled = true; btn.parentNode.after(h('div', { class: 'panel' }, st, prog)); sfx(500);
    try { const o = await t.run(files, v, { progress: p => prog.value = Math.min(1, p) }); sfx(820, .15); done(o); }
    catch (e) { console.error(e); btn.disabled = false; btn.parentNode.nextSibling?.remove(); err(e instanceof U ? e.message : 'Something went wrong while processing this file. Please try another file.'); }
  }
  async function done(o) {
    urls.forEach(URL.revokeObjectURL); urls = o.map(x => URL.createObjectURL(x.blob));
    const r = recent().filter(x => x !== t.id); try { localStorage.setItem('recent', JSON.stringify([t.id, ...r].slice(0, 6))); } catch {}
    const links = o.map((x, i) => h('a', { class: 'btn primary', href: urls[i], download: x.name, onclick: () => sfx(740) }, 'Download' + (o.length > 1 ? ' ' + x.name : '')));
    if (o.length > 1) links.unshift(h('button', { class: 'btn primary', onclick: async () => { const z = new (await lib.zip())(); o.forEach(x => z.file(x.name, x.blob)); const b = await z.generateAsync({ type: 'blob' });
      const u = URL.createObjectURL(b); urls.push(u); h('a', { href: u, download: 'foldr-files.zip' }).click(); } }, 'Download all (ZIP)'));
    body.replaceChildren(h('div', { class: 'panel ok' }, h('div', { class: 'tick', 'aria-hidden': 'true' }, '✓'), h('h2', {}, 'Done!'), h('p', {}, 'Your file is ready.'),
      h('div', { class: 'acts' }, links), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: reset }, 'Process another file'))));
  }
  function render() {
    if (!files.length) return body.replaceChildren(drop(), h('p', { style: 'text-align:center;color:var(--mut)' }, 'Supported: ' + ({ 'video/*': 'MP4, MOV, WEBM', 'image/*': 'JPG, PNG, WEBP, GIF', 'application/pdf': 'PDF', 'audio/*': 'MP3, WAV, OGG, M4A, FLAC' })[t.accept]));
    if (t.view) { const box = h('div', { class: 'panel' }); body.replaceChildren(h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: reset }, 'Choose another file')), box);
      t.view(files[0], box).catch(e => { console.error(e); err(e instanceof U ? e.message : 'Something went wrong while opening this file.'); }); return; }
    const btn = h('button', { class: 'btn primary', onclick: () => files.length < (t.min || 1) ? err(`Add at least ${t.min} files.`) : go(btn) }, t.name.replace(/^(\w+) /, '$1 → ').split(' → ')[0] === 'PDF' ? 'Process' : 'Apply');
    body.replaceChildren(h('div', { class: 'panel' }, list(), t.multi && h('div', { class: 'acts' }, h('label', { class: 'btn sm' }, 'Add more', h('input', { type: 'file', hidden: '', multiple: '', accept: t.accept, onchange: e => add([...e.target.files]) }))),
      h('div', { class: 'opts' }, t.fields.map(fld)), h('div', { class: 'acts' }, btn, h('button', { class: 'btn', onclick: reset }, 'Remove files'))));
  }
  render(); return root;
}

function home() {
  const q = h('input', { class: 'bigsearch', type: 'search', placeholder: 'Search tools: merge, rotate, crop…', 'aria-label': 'Search tools', readonly: '', onclick: search, onkeydown: e => e.key === 'Enter' && search() });
  const r = recent().map(id => T.find(t => t.id === id)).filter(Boolean);
  return h('div', {}, h('div', { class: 'hero' }, h('h1', {}, 'All your file tools, in one place.'),
    h('p', {}, 'Compress, edit, convert, organize and transform your files directly in your browser. Nothing is uploaded.'), q),
    r.length ? h('div', {}, h('h2', {}, 'Recently used'), grid(r)) : null,
    h('h2', {}, 'Popular tools'), grid(['pdf-merge', 'trim-video', 'resize-image', 'pdf-split', 'color-picker', 'pdf-reader'].map(id => T.find(t => t.id === id))),
    Object.entries(CATS).map(([k, [i, n]]) => h('div', {}, h('h2', {}, i + ' ' + n), grid(T.filter(t => t.cat === k)))));
}

function search() {
  const inp = h('input', { type: 'search', placeholder: 'Search tools…', 'aria-label': 'Search tools' }), list = h('div', { class: 'res' });
  const upd = () => { const q = inp.value.toLowerCase().trim(); const r = T.filter(t => q.split(/\s+/).filter(w => w.length > 2).every(w => [t.name, t.desc, t.kw, t.cat].join(' ').toLowerCase().includes(w)));
    list.replaceChildren(...(r.length ? r.map(card) : [h('p', {}, 'No tools match. Try “merge”, “crop” or “rotate”.')])); };
  inp.oninput = upd; inp.onkeydown = e => e.key === 'Enter' && list.firstElementChild?.click(); upd(); openDlg(inp, list); inp.focus();
}
function settings() {
  const set = (k, v) => { S[k] = v; save(); sfx(600); };
  openDlg(h('h2', {}, 'Settings'),
    h('label', { class: 'fld' }, 'Theme', h('select', { onchange: e => set('theme', e.target.value) }, ['system', 'light', 'dark'].map(v => h('option', { value: v, selected: S.theme === v ? '' : null }, v[0].toUpperCase() + v.slice(1))))),
    h('label', { class: 'row' }, 'Sound effects', h('input', { type: 'checkbox', checked: S.sfx, onchange: e => set('sfx', e.target.checked) })),
    h('label', { class: 'fld' }, 'Volume', h('input', { type: 'range', min: 0, max: 1, step: .05, value: S.vol, onchange: e => set('vol', +e.target.value) })),
    h('label', { class: 'row' }, 'Reduced motion', h('input', { type: 'checkbox', checked: S.rm, onchange: e => set('rm', e.target.checked) })),
    h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Close')));
}

function route() {
  const [, k, id] = location.hash.split('/'); dlg.open && dlg.close(); const t = k === 't' && T.find(x => x.id === id);
  app.replaceChildren(t ? toolPage(t) : CATS[k] ? h('div', {}, h('h1', {}, CATS[k].join(' ')), grid(T.filter(x => x.cat === k))) : home());
  document.title = (t ? t.name + ' — ' : '') + 'Foldr'; scrollTo(0, 0);
  $('#nav').replaceChildren(h('a', { href: '#/', class: !k ? 'on' : '' }, 'Home'), ...Object.entries(CATS).map(([c, [, n]]) => h('a', { href: '#/' + c, class: k === c || t?.cat === c ? 'on' : '' }, n)));
}
addEventListener('hashchange', route);
$('#sbtn').onclick = search; $('#setbtn').onclick = settings;
$('#tbtn').onclick = () => { S.theme = document.documentElement.dataset.theme === 'dark' || (S.theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches) ? 'light' : 'dark'; save(); sfx(600); };
addEventListener('keydown', e => { const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' || (e.key === '/' && !typing)) { e.preventDefault(); search(); } });
save(); route();
