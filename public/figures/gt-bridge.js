/* gtjs bridge: connects a machine figure to the game.

   Inside the game the figure runs in an iframe and the game owns the machine:
     game -> figure  { type:'gt:state', machine:{ name, enabled, running, stalled, progress, steam, recipe, recipes,
                                                  input, output } }
     figure -> game  { type:'gt:ready' }   once the figure is mounted
                     { type:'gt:toggle' }  the steam valve / power switch
                     { type:'gt:setRecipe', id }
   Opened on its own (no parent page) gtBridge.embedded is false and the figure runs its own demo.

   ?sprite=1 is the floor-sprite mode used by tools/snapshot-figures.mjs: only the drawing shows, on a transparent page,
   and the figure's tile corners are written to <html data-sprite="…"> as fractions of the drawing's width. */
(() => {
  const embedded = window.parent !== window;
  const q = new URLSearchParams(location.search);
  const subs = [];
  addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data;
    if (d && d.type === 'gt:state') for (const cb of subs) cb(d.machine);
  });
  const send = msg => { if (embedded) window.parent.postMessage(msg, location.origin); };

  if (q.get('sprite') === '1') {
    const css = document.createElement('style');
    css.textContent = 'html,body{background:none!important}body{padding:0!important;display:block!important}'
      + 'body>*:not(.stage){display:none!important}.stage>*:not(#fig):not(.zwrap){display:none!important}'
      + '.zwrap>*:not(#fig){display:none!important}#fig{max-width:none!important;max-height:none!important;width:100vw!important;margin:0!important}';
    document.head.appendChild(css);
  }

  window.gtBridge = {
    embedded,
    onState(cb) { subs.push(cb); },
    send,
    ready() { send({ type: 'gt:ready' }); },
    // tile: the four floor corners [x, y, 0] of the machine's tile, in figure units
    sprite(tile) {
      if (q.get('sprite') !== '1') return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        // corners as fractions of the drawing's width, measured from its top-left corner (the sprite's pixel 0, 0),
        // so they hold at any screenshot size
        const svg = document.getElementById('fig'), m = svg.getScreenCTM(), r = svg.getBoundingClientRect();
        const fr = tile.map(p => { const [X, Y] = P(...p), d = new DOMPoint(X, Y).matrixTransform(m);
          return [+((d.x - r.left) / r.width).toFixed(4), +((d.y - r.top) / r.width).toFixed(4)]; });
        document.documentElement.dataset.sprite = JSON.stringify({ tile: fr, aspect: +(r.height / r.width).toFixed(4) });
      }));
    },
  };
})();
