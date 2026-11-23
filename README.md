# Taccuino di Viaggio

An interactive travel sketchbook: seven spreads (Rome, Seillans and Fayence, Spain, Tianzifang,
furniture studies, clothes) built from photos of the real pages. Turn pages with the arrows, the
arrow keys, or by dragging a page's outer edge. Every drawing is cut from the scan, never redrawn.
Open `index.html` through any static server (`python3 -m http.server`).

- **Sunset page**: the sun sets behind the mountains while the sky and sea regrade
  through orange, rose and violet using the drawing's own pencil strokes. Tap or drag on
  the sea for ripples, drag the sky up and down to move the sun, tap the sky to send gulls off.
  The sky is coloured in edge to edge with patches of the artist's own hatching (`tools/fill_sky.py`).
- **Treats page**: tap the watermelon, cherry, popsicle and éclair. The popsicle is eaten one bite per tap; tap the stick for another.

## Rebuilding the assets from the photo

```sh
pip install opencv-python-headless numpy scipy
python3 tools/extract.py photo.jpg work      # flatten the two pages
python3 tools/flatten.py work                # remove the photo lighting
python3 tools/clean.py work                  # remove the fingers + edges
python3 tools/build_assets.py work assets    # fill the sky, cut layers, masks, sprites
python3 tools/paper.py assets/paper.webp     # paper grain
```

### The other six spreads

```sh
python3 tools/pages.py tools/spreads.json photos pages     # flatten + de-light + remove fingers
python3 tools/build_pages.py pages assets                  # cut items listed in tools/pages_config.py
python3 tools/glow_tex.py work/right_clean.png assets/glow.webp   # lamplight, from the artist's yellow hatching
```

`tools/pages_config.py` lists every item on every page and what it does when tapped
(bite, scoop, sip, fold, swing, hop, walk, sway in the breeze, glow, toss, slice...).
The engine is `SketchPage` in `app.js`.

### This round

- `src/` holds the engine pieces that are concatenated into `app.js`: `engine.js` (pencil colouring,
  hatching, sounds), `cat.js` (the redrawn Seillans cat: a skeleton with IK legs, a walk cycle,
  breathing, blinks, ear flicks, sitting and a sprung tail), `page.js` (pages: dragging, colouring
  sweeps, pieces, cheese pulls), `curl.js` (the WebGL page turn).
- Colouring in uses the artist's own yellow hatching from the sunset page as the stroke texture,
  revealed band by band in the order a hand lays strokes.
