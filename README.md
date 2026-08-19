# Billboard Remix — Add a Devin billboard to your city

A zero-dependency single page that draws a synthetic Devin billboard into any city photo,
then hands you a full-resolution PNG and a prefilled X post.

## Use it

```
python3 -m http.server 8123   # then open http://localhost:8123/
```

1. Upload a street, skyline or rooftop photo, or use the procedural Sample city.
2. Choose a line, then drag inside the board to move it or drag its four handles to size and tilt it.
3. Download the PNG, copy the caption, or post it on X.

## How the board is drawn

The photo is drawn first, followed by a dark billboard face, frame, drop shadow, legs and
catwalk band. The text layer uses a subtle top-down lighting gradient and is inverse-mapped
into the four-corner quad with an 8x8 homography solve and bilinear sampling. Warm gantry
lights are drawn over the face last.

No build step, no dependencies, no uploads — everything happens in the canvas on your machine.

## Files

- `index.html` / `styles.css` — UI
- `app.js` — homography solve, board renderer, text layer, warp/composite, sample city generator
- `example-output.png` — exported example
