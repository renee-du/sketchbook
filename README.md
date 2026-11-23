# Taccuino di Roma

An interactive version of a two-page colored-pencil spread from a Rome sketchbook.
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
