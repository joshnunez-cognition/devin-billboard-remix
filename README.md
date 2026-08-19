# Billboard Remix — Do It All With Devin

A zero-dependency single page that pastes your own line onto a real billboard photo with
correct perspective, then hands you a full-resolution PNG and a prefilled quote-tweet.

Built for the "Do It All With Devin" campaign launch (39 boards live across NYC & SF).

## Use it

```
python3 -m http.server 8123   # then open http://localhost:8123/
```

1. Upload a photo of a live board (or use the bundled sample photo / procedural sample scene).
2. Drag the four handles onto the corners of the board face.
3. Type your line, pick a look, tune size and blend.
4. Download PNG, copy the caption, quote-tweet.

## How the warp works

The four handles define a quad in image space. `homography()` solves the 8x8 system for the
projective transform from that quad back to the text layer, and `warp()` inverse-maps every
pixel inside the quad's bounding box, sampling the text layer bilinearly. The `blend` control
modulates the pasted face by the underlying scene luminance so the board picks up the photo's
own light instead of looking like a flat sticker.

No build step, no dependencies, no uploads — everything happens in the canvas on your machine.

## Files

- `index.html` / `styles.css` — UI
- `app.js` — homography solve, text layer, warp/composite, sample scene generator
- `sample-photo.jpg` — blank-faced billboard for demos
- `example-output.png` — exported example
