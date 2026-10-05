# Foldr: file tools that run in your browser

A static site (no backend, no build step). Files are processed locally and never uploaded.

## Deploy to GitHub Pages
1. Create a GitHub repository and push this folder to the `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes the site on every push.

All paths are relative, so it works under `https://<user>.github.io/<repo>/`.
To test locally: `python3 -m http.server` in this folder (ES modules need http, not file://).

## Tools included (all 30 run in the browser)
- **Video** (WebM export, real time via MediaRecorder): Crop, Trim
- **Image** (Canvas): Resize, Crop, Color Picker, Rotate, Flip, Enlarger, GIF Maker
- **Audio** (Web Audio; WAV or MP3 output): Converter, Trimmer, Cutter, Speed Changer, Volume (dB) Changer, Reverser
- **PDF** (pdf-lib, PDF.js): Merge, Split, Page Remover, Extract Pages, Rotate, Organize, Resize, Crop, Flatten, Reader, Extract Images, Edit, Annotate, E-sign, Create Fillable, Protect, Unlock

## Notes
- Libraries (pdf-lib, PDF.js, JSZip) load from jsDelivr only when a tool needs them.
- Crop, Edit, Annotate, E-sign and Fillable placement use page-percentage inputs and page-range text, not drag-to-place or thumbnails.
- Unlock re-saves each page as an image (text becomes non-selectable). It needs the correct password.
- Audio speed change also shifts pitch. MP3 output uses lamejs (128 kbps).
- Video export plays the clip while recording, so it takes as long as the selected section.

## Structure
`index.html` (shell), `styles.css` (themes), `app.js` (settings, sound, search, tool pages, processing engines).
