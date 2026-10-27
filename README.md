# gtjs

A small browser factory game after GregTech: New Horizons: start with nothing, gather by hand, build a coal furnace,
work up through steam to LV electricity and an electric blast furnace, and make aluminium. Every machine is an
isometric figure you can open, turn round and see through while it works.

An unofficial fan project, not affiliated with GregTech or the GT: New Horizons team. The art and code are its own.

## Play

Saves live in your browser. Controls on the floor:

- drag with the middle button (or the left one with the Open tool), or the arrows / WASD, to pan
- the wheel zooms; hold the right button and drag sideways to turn the view (Q / E turn a quarter)
- Home looks at your machines again; Esc puts the current tool down

## Develop

```
npm install
npm run dev        # the game at http://localhost:5173
npm test
npm run build      # a static site in dist/, served from any folder of any host
npm run sprites    # re-render the floor sprites from the figures (needs Chrome)
```

`docs/DESIGN.md` describes how it is put together. Pushes to `main` publish the game on GitHub Pages
(`.github/workflows/pages.yml`).

## Credits

Machine figures are drawn with the Colorfigures engine (`public/figures/core.js`), MIT licensed: see
`public/figures/LICENSE`.
