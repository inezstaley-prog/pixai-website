/* <video-slot id="..." placeholder="..."> — drag-drop or click to load an mp4
   straight from the computer. The file is stored as a Blob in IndexedDB under
   the slot id, so it survives reloads. Playback is click-to-play WITH SOUND
   (a user gesture starts it, so autoplay policy allows audio); only one slot
   plays at a time. Fills its container (parent needs position:relative + a ratio). */
(() => {
  if (window.customElements.get('video-slot')) return;

  const DB = 'pixai-media', STORE = 'videos';
  let dbp;
  const db = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const put = async (k, v) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const get = async (k) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, 'readonly'); const q = t.objectStore(STORE).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); };
  const del = async (k) => { const d = await db(); return new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(k); t.oncomplete = res; }); };

  class VideoSlot extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const key = this.getAttribute('id') || 'video-slot';
      const ph = this.getAttribute('placeholder') || 'Drop an MP4';
      const src = this.getAttribute('src') || '';
      const poster = this.getAttribute('poster') || '';

      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
<style>
  :host { position: absolute; inset: 0; display: block; overflow: hidden; background: #0A0A0A; }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: none; cursor: pointer; background: #0A0A0A; }
  /* A poster is enough to show the tile as filled even before any file is picked. */
  :host([poster]) .ph { display: none; }
  :host([poster]) video { display: block; }
  :host([data-filled]) video { display: block; }
  .ph { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
        border: 1px dashed rgba(201,162,75,0.34); color: rgba(245,242,235,0.5); cursor: pointer;
        font-family: 'Montserrat', system-ui, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; text-align: center; padding: 18px;
        transition: border-color .3s, color .3s, background .3s; }
  .ph:hover, :host([data-drag]) .ph { border-color: rgba(201,162,75,0.85); color: #C9A24B; background: rgba(201,162,75,0.06); }
  :host([data-filled]) .ph { display: none; }
  .arrow { width: 22px; height: 22px; border: 1px solid currentColor; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; letter-spacing: 0; }
  .play { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; cursor: pointer; transition: opacity .4s; }
  :host([data-filled]) .play, :host([poster]) .play { display: flex; }
  :host([data-playing]) .play { opacity: 0; }
  .disc { width: 54px; height: 54px; border-radius: 50%; border: 1px solid rgba(201,162,75,0.75); background: rgba(0,0,0,0.32);
          backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; transition: transform .35s, background .35s; }
  .play:hover .disc { transform: scale(1.12); background: rgba(201,162,75,0.24); }
  .tri { width: 0; height: 0; border-left: 13px solid #C9A24B; border-top: 8px solid transparent; border-bottom: 8px solid transparent; margin-left: 4px; }
  .tools { position: absolute; top: 10px; right: 10px; display: none; gap: 6px; opacity: 0; transition: opacity .25s; }
  :host([data-filled]:hover) .tools { display: flex; opacity: 1; }
  :host([static]) .tools, :host([static]) .ph { display: none !important; }
  .tools button { font-family: 'Montserrat', system-ui, sans-serif; font-size: 9px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(245,242,235,0.85); background: rgba(0,0,0,0.55); border: 1px solid rgba(245,242,235,0.28); padding: 5px 8px; cursor: pointer; backdrop-filter: blur(8px); }
  .tools button:hover { color: #C9A24B; border-color: rgba(201,162,75,0.7); }
  :host([data-drag])::after { content: ''; position: absolute; inset: 0; border: 1px solid #C9A24B; pointer-events: none; }
</style>
<video loop playsinline preload="none"></video>
<div class="ph"><div class="arrow">&#8593;</div><div>${ph}</div></div>
<div class="play"><div class="disc"><div class="tri"></div></div></div>
<div class="tools"><button data-act="replace">Replace</button><button data-act="clear">Remove</button></div>
<input type="file" accept="video/mp4,video/*" hidden>`;

      const v = root.querySelector('video');
      const input = root.querySelector('input');
      v.muted = false; v.volume = 1;
      v.preload = 'none';
      if (poster) v.poster = poster;

      const load = (blobOrUrl) => {
        if (this._url) { URL.revokeObjectURL(this._url); this._url = null; }
        const url = typeof blobOrUrl === 'string' ? blobOrUrl : (this._url = URL.createObjectURL(blobOrUrl));
        v.src = url;
        this.setAttribute('data-filled', '');
        this.removeAttribute('data-playing');
      };
      const accept = async (file) => {
        if (!file || !file.type.startsWith('video/')) return;
        load(file);
        try { await put(key, file); } catch (e) { console.warn('video-slot: could not persist', e); }
      };

      root.querySelector('.ph').addEventListener('click', () => { if (!this.hasAttribute('static')) input.click(); });
      root.querySelector('.play').addEventListener('click', () => { if (this.hasAttribute('data-filled') || this.hasAttribute('static')) this._toggle(v); else input.click(); });
      v.addEventListener('click', () => { if (this.hasAttribute('data-filled') || this.hasAttribute('static')) this._toggle(v); else input.click(); });
      v.addEventListener('pause', () => this.removeAttribute('data-playing'));
      v.addEventListener('play', () => this.setAttribute('data-playing', ''));
      input.addEventListener('change', () => { accept(input.files[0]); input.value = ''; });
      root.querySelector('.tools').addEventListener('click', async (e) => {
        const act = e.target.dataset.act;
        if (act === 'replace') input.click();
        if (act === 'clear') {
          v.pause(); v.removeAttribute('src'); v.load();
          this.removeAttribute('data-filled'); this.removeAttribute('data-playing');
          if (this._url) { URL.revokeObjectURL(this._url); this._url = null; }
          await del(key);
        }
      });

      ['dragenter', 'dragover'].forEach(t => this.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); this.setAttribute('data-drag', ''); }));
      ['dragleave', 'dragend'].forEach(t => this.addEventListener(t, () => this.removeAttribute('data-drag')));
      this.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.removeAttribute('data-drag');
        accept(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      });

      if (src) load(src);
      else if (!this.hasAttribute('static')) get(key).then(b => { if (b) load(b); }).catch(() => {});
    }

    _toggle(v) {
      if (v.paused) {
        // Pause any other slot so two soundtracks never overlap.
        document.querySelectorAll('video-slot').forEach(s => { if (s !== this) s._pause && s._pause(); });
        v.muted = false; v.volume = 1;
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      } else v.pause();
    }

    _pause() { const v = this.shadowRoot && this.shadowRoot.querySelector('video'); if (v && !v.paused) v.pause(); }

    disconnectedCallback() { if (this._url) { URL.revokeObjectURL(this._url); this._url = null; } }
  }
  window.customElements.define('video-slot', VideoSlot);
})();
