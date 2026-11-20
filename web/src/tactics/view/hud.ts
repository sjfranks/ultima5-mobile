/**
 * hud.ts
 *
 * The tactical board's chrome, as the Modern look frames its panes: black
 * wells in bars of wood with a copper edge, the game's lettering for
 * labels and numbers. The dock (hotbar and End Turn), its info line, the
 * readout of a roll, the confirm pill, the little dialogs, the log, the
 * settings and the list of fights. Built once; table.ts fills it.
 */

export const CSS = `
.tx{position:fixed;inset:0;overflow:hidden;background:var(--tx-bg);color:var(--tx-ink);font-family:'IM Fell English',Georgia,serif;-webkit-user-select:none;user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent;
 --tx-bg:#000;--tx-ink:#efe6d2;--tx-dim:#a99c84;--tx-wood:#6b3d1c;--tx-wood2:#9a5a2a;--tx-wood3:#2c170a;--tx-copper:#d9893f;--tx-gold:#f0c45a;--tx-red:#e0533e;--tx-blue:#6fa8ff;--tx-green:#8fd27a;--tx-well:#0b0806;}
.tx *{box-sizing:border-box}
.tx canvas.board{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;touch-action:none}
.tx .px{font-family:'Sixtyfour','Courier New',monospace;letter-spacing:.02em}
.tx .frame{background:var(--tx-well);border:3px solid var(--tx-wood);border-radius:6px;box-shadow:inset 0 0 0 1px var(--tx-wood3),0 0 0 1px var(--tx-wood3),inset 0 1px 0 2px rgba(217,137,63,.25),0 3px 10px rgba(0,0,0,.6);border-image:linear-gradient(180deg,var(--tx-wood2),var(--tx-wood) 40%,var(--tx-wood3)) 1}
.tx .top{position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;align-items:center;gap:5px 6px;padding:max(6px,env(safe-area-inset-top)) 8px 4px;z-index:5;pointer-events:none}
.tx .top .names{flex:1;min-width:0}
.tx .top>*{pointer-events:auto}
.tx .title{font-size:10px;color:var(--tx-copper);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tx .round{font-size:9px;color:var(--tx-dim);white-space:nowrap}
.tx .order{display:flex;gap:3px;flex:1 0 100%;order:9;overflow:hidden;justify-content:center;min-width:0}
.tx .order canvas{width:22px;height:22px;image-rendering:pixelated;border:1px solid #333;border-radius:3px;background:#120c08;flex:none}
.tx .order canvas.hero{border-color:#3d6fc4}.tx .order canvas.foe{border-color:#8c2a20}
.tx .order canvas.now{outline:2px solid var(--tx-gold);outline-offset:0}
.tx .order canvas.done{opacity:.35}
.tx .btn{font-family:'Sixtyfour',monospace;font-size:10px;color:var(--tx-ink);background:linear-gradient(180deg,#3a2414,#1a0f07);border:2px solid var(--tx-wood2);border-radius:5px;padding:6px 8px;min-height:32px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,210,150,.18),0 2px 0 var(--tx-wood3)}
.tx .btn:active{transform:translateY(1px)}
.tx .btn.on{border-color:var(--tx-gold);color:var(--tx-gold)}
.tx .readout{position:absolute;left:50%;top:76px;transform:translateX(-50%);min-width:180px;max-width:min(92vw,420px);padding:6px 12px 8px;text-align:center;z-index:6;pointer-events:none;opacity:0;transition:opacity .25s}
.tx .readout.show{opacity:1}
.tx .readout .rt{font-family:'Sixtyfour',monospace;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:var(--tx-copper)}
.tx .readout .notes{display:flex;flex-wrap:wrap;gap:2px 10px;justify-content:center;margin-top:3px}
.tx .readout .note{font-family:'Sixtyfour',monospace;font-size:8px;text-transform:uppercase;color:var(--tx-gold);animation:txPop .22s ease-out}
.tx .readout .note.red{color:var(--tx-red)}.tx .readout .note.blue{color:var(--tx-blue)}
.tx .readout .res{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;margin-top:4px}
.tx .readout .r{animation:txPop .25s ease-out;white-space:nowrap}
.tx .readout .r b{font-family:'Sixtyfour',monospace;font-size:20px;color:var(--tx-red)}
.tx .readout .r.crit b{color:var(--tx-gold)}.tx .readout .r.heal b{color:var(--tx-green)}.tx .readout .r.miss b{color:var(--tx-dim);font-size:15px}.tx .readout .r.blue b{color:var(--tx-blue);font-size:13px}
.tx .readout .r small{font-size:11px;color:var(--tx-dim);margin-left:4px}
.tx .readout .r .ko{font-family:'Sixtyfour',monospace;font-size:10px;color:#fff;background:var(--tx-red);padding:1px 4px;border-radius:3px;margin-left:5px}
.tx .readout .r .who{font-size:12px;color:var(--tx-ink);margin-right:4px}
@keyframes txPop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}
.tx .dock{position:absolute;left:0;right:0;bottom:0;padding:0 6px max(8px,env(safe-area-inset-bottom));z-index:5;display:flex;flex-direction:column;align-items:center;pointer-events:none;
 --slot:clamp(38px,calc((min(100vw,560px) - 80px)/6),62px)}
.tx .dock>*{pointer-events:auto}
.tx .info{width:min(100%,560px);padding:6px 10px;margin-bottom:6px;min-height:58px}
.tx .info .nm{font-weight:bold;font-size:16px;color:var(--tx-ink)}
.tx .info .meta{font-variant:small-caps;font-size:13px;color:var(--tx-copper);margin-left:6px;letter-spacing:.03em}
.tx .info .tx2{font-size:13.5px;color:var(--tx-ink);line-height:1.2;margin-top:1px}
.tx .info .hint{font-size:13px;color:var(--tx-dim);margin-top:1px}
.tx .info .hint.odds{color:var(--tx-gold)}
.tx .barrow{display:flex;align-items:center;gap:4px;max-width:100%}
.tx .pager{width:22px;height:var(--slot);font-size:14px;padding:0;min-height:0;display:flex;align-items:center;justify-content:center}
.tx .pager[disabled]{opacity:.3}
.tx .slots{display:flex;gap:4px;touch-action:pan-y;transition:transform .16s ease-out}
.tx .slot{position:relative;width:var(--slot);height:var(--slot);border-radius:7px;cursor:pointer;flex:none;
 background:linear-gradient(160deg,var(--tx-wood2),var(--tx-wood) 45%,var(--tx-wood3));padding:3px;box-shadow:0 2px 0 #140a04,inset 0 1px 0 rgba(255,210,160,.35);transition:transform .12s}
.tx .slot .well{position:absolute;inset:3px;border-radius:5px;background:radial-gradient(circle at 50% 40%,hsl(var(--h) 55% 32%),hsl(var(--h) 45% 12%) 70%,#050302);box-shadow:inset 0 2px 4px rgba(0,0,0,.8)}
.tx .slot svg{position:absolute;inset:18%;width:64%;height:64%;stroke:#fff;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 3px rgba(255,255,255,.55))}
.tx .slot .key{position:absolute;left:5px;top:3px;font-family:'Sixtyfour',monospace;font-size:8px;color:#f6e8c8;text-shadow:0 1px 0 #000}
.tx .slot .die{position:absolute;right:4px;bottom:3px;font-family:'Sixtyfour',monospace;font-size:7.5px;color:#ffe9b0;text-shadow:0 1px 0 #000}
.tx .slot .uses{position:absolute;right:3px;top:3px;font-family:'Sixtyfour',monospace;font-size:7.5px;color:#fff;background:rgba(0,0,0,.65);border-radius:3px;padding:0 2px}
.tx .slot .cool{position:absolute;inset:3px;border-radius:5px;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;font-family:'Sixtyfour',monospace;font-size:14px;color:#fff}
.tx .slot.sel{transform:translateY(-4px);box-shadow:0 0 0 2px var(--tx-gold),0 0 12px 2px rgba(240,196,90,.6),0 6px 0 #140a04}
.tx .slot.off svg{stroke:#777;filter:none}.tx .slot.off .well{filter:grayscale(1) brightness(.55)}
.tx .slot.empty{background:none;box-shadow:none;border:2px dashed #4a3020;cursor:default}
.tx .slot.shake{animation:txShake .35s}
@keyframes txShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
.tx .slot.end{background:linear-gradient(160deg,#8a3a22,#5a2010 50%,#2a0c04)}
.tx .slot.end .well{background:radial-gradient(circle at 50% 40%,#5c1c10,#1a0602 75%)}
.tx .slot.end span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-family:'Sixtyfour',monospace;font-size:8px;line-height:1.3;color:#ffe1c4}
.tx .slot.end.pulse{animation:txPulse 1s infinite}
@keyframes txPulse{0%,100%{box-shadow:0 2px 0 #140a04,0 0 0 0 rgba(240,196,90,.0)}50%{box-shadow:0 2px 0 #140a04,0 0 0 4px rgba(240,196,90,.75)}}
.tx .slot.end.wait{filter:grayscale(.8) brightness(.6)}
.tx .rotate{position:absolute;right:8px;bottom:calc(var(--slot) + 80px);display:none}
.tx .pill{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--slot) + 92px);z-index:7;display:none;font-family:'Sixtyfour',monospace;font-size:12px;color:#200;background:linear-gradient(180deg,#ffd88a,#e8a23c);border:2px solid #fff3d0;border-radius:999px;padding:9px 18px;box-shadow:0 4px 14px rgba(0,0,0,.6);cursor:pointer;animation:txPop .2s ease-out}
.tx .pill.show{display:block}
.tx .scrim{position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px}
.tx .scrim.show{display:flex}
.tx .dialog{width:min(92vw,360px);padding:14px 16px;text-align:center}
.tx .dialog p{margin:0 0 14px;font-size:17px;line-height:1.3}
.tx .dialog .row{display:flex;gap:10px;justify-content:center}
.tx .dialog .btn.primary{border-color:var(--tx-gold);color:var(--tx-gold)}
.tx .panel{width:min(94vw,440px);max-height:86vh;overflow:auto;padding:12px 14px;touch-action:pan-y}
.tx .panel h2{font-family:'Sixtyfour',monospace;font-size:12px;letter-spacing:.15em;color:var(--tx-copper);margin:2px 0 10px;text-align:center;font-weight:normal}
.tx .panel label{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #2a1a0e;font-size:15px}
.tx .panel label small{display:block;color:var(--tx-dim);font-size:12px}
.tx .panel input[type=checkbox]{width:20px;height:20px;accent-color:#d9893f}
.tx .panel select{font-family:inherit;font-size:14px;background:#1a0f07;color:var(--tx-ink);border:1px solid var(--tx-wood2);border-radius:4px;padding:4px}
.tx .log{position:absolute;left:8px;right:8px;top:76px;bottom:calc(var(--slot) + 92px);z-index:8;display:none;padding:8px 10px;overflow:auto;font-size:13.5px;line-height:1.35;touch-action:pan-y}
.tx .log.show{display:block}
.tx .log div{padding:1px 0}.tx .log .dice{color:var(--tx-gold)}.tx .log .hero{color:#cfe0ff}.tx .log .foe{color:#ffc8bc}.tx .log .dim{color:var(--tx-dim)}.tx .log .big{color:var(--tx-copper);font-family:'Sixtyfour',monospace;font-size:11px}
.tx .log s{color:#8a7a68}
.tx .menu{width:min(94vw,520px);max-height:92vh;overflow:auto;padding:14px;touch-action:pan-y}
.tx .menu h1{font-family:'Sixtyfour',monospace;font-size:15px;letter-spacing:.12em;color:var(--tx-copper);text-align:center;margin:4px 0 2px;font-weight:normal}
.tx .menu .sub{text-align:center;color:var(--tx-dim);font-size:14px;margin-bottom:12px}
.tx .menu .enc{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #3a2414;border-radius:6px;margin-bottom:8px;cursor:pointer;background:rgba(255,255,255,.02)}
.tx .menu .enc:hover{border-color:var(--tx-copper)}
.tx .menu .enc.locked{opacity:.45;cursor:default}
.tx .menu .enc .n{font-family:'Sixtyfour',monospace;font-size:16px;color:var(--tx-copper);width:22px;flex:none;text-align:center}
.tx .menu .enc b{font-size:17px}.tx .menu .enc p{margin:3px 0 0;font-size:13.5px;color:var(--tx-dim);line-height:1.25}
.tx .menu .enc .won{font-family:'Sixtyfour',monospace;font-size:9px;color:var(--tx-green);margin-left:6px}
.tx .menu .foes{display:flex;gap:2px;margin-top:5px}.tx .menu .foes canvas{width:20px;height:20px;image-rendering:pixelated}
.tx .menu .help{font-size:13.5px;color:var(--tx-dim);line-height:1.3;border-top:1px solid #2a1a0e;margin-top:10px;padding-top:8px}
.tx .banner{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);z-index:9;font-family:'Sixtyfour',monospace;font-size:clamp(16px,5vw,26px);letter-spacing:.12em;color:var(--tx-gold);text-shadow:0 3px 0 #000,0 0 18px rgba(240,196,90,.5);pointer-events:none;opacity:0;transition:opacity .3s;white-space:nowrap}
.tx .banner.show{opacity:1}
.tx .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:4}
@media (prefers-reduced-motion:reduce){.tx .slot.shake,.tx .slot.end.pulse{animation:none}.tx .readout .note,.tx .readout .r,.tx .pill{animation:none}}
`;

/** Line icons for the hotbar (24 by 24). */
export const ICONS: Record<string, string> = {
  sword: 'M5 19 L17 7 L19 5 L19 7 L7 19 M4 16 L8 20 M6 18 L3 21',
  dagger: 'M7 17 L15 9 L17 7 L17 9 L9 17 M6 14 L10 18 M8 16 L5 19',
  bow: 'M6 4 Q20 12 6 20 M6 4 L6 20 M4 12 L18 12 M15 9 L18 12 L15 15',
  bolt: 'M13 3 L6 13 L11 13 L9 21 L18 9 L13 9 Z',
  moon: 'M15 4 A8 8 0 1 0 20 15 A6 6 0 1 1 15 4 Z M18 5 L20 5 M19 4 L19 6',
  flame: 'M12 3 Q18 9 15 14 Q19 12 18 17 Q16 21 12 21 Q7 21 6 17 Q5 12 10 9 Q9 13 11 14 Q9 8 12 3 Z',
  burst: 'M12 2 L14 9 L21 7 L16 12 L21 17 L14 15 L12 22 L10 15 L3 17 L8 12 L3 7 L10 9 Z',
  heart: 'M12 20 L4 12 A4.5 4.5 0 0 1 12 6 A4.5 4.5 0 0 1 20 12 Z M12 9 L12 15 M9 12 L15 12',
  drop: 'M12 3 Q19 12 19 15 A7 7 0 0 1 5 15 Q5 12 12 3 Z M9 15 L15 15',
  shield: 'M12 3 L19 6 L19 12 Q19 18 12 21 Q5 18 5 12 L5 6 Z M12 7 L12 17',
  hand: 'M8 13 L8 6 A1.5 1.5 0 0 1 11 6 L11 12 L11 4.5 A1.5 1.5 0 0 1 14 4.5 L14 12 L14 6 A1.5 1.5 0 0 1 17 6 L17 15 Q17 21 11 21 Q7 21 5 16 L4 13 A1.5 1.5 0 0 1 7 12 Z',
  eye: 'M2 12 Q12 3 22 12 Q12 21 2 12 Z M12 9 A3 3 0 1 1 12 15 A3 3 0 1 1 12 9 Z',
  claw: 'M6 4 Q4 12 9 20 M11 3 Q9 12 13 20 M16 4 Q14 12 18 19',
};

export const svgIcon = (k: string): string => `<svg viewBox="0 0 24 24"><path d="${ICONS[k] ?? ICONS.sword}"/></svg>`;

export interface Hud {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  title: HTMLElement;
  round: HTMLElement;
  order: HTMLElement;
  readout: HTMLElement;
  info: HTMLElement;
  slots: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  pill: HTMLElement;
  rotate: HTMLButtonElement;
  scrim: HTMLElement;
  log: HTMLElement;
  banner: HTMLElement;
  flash: HTMLElement;
  logBtn: HTMLButtonElement;
  setBtn: HTMLButtonElement;
  menuBtn: HTMLButtonElement;
  intentsBtn: HTMLButtonElement;
  threatBtn: HTMLButtonElement;
  undoBtn: HTMLButtonElement;
}

export function buildHud(host: HTMLElement): Hud {
  if (!document.getElementById('tx-css')) {
    const st = document.createElement('style');
    st.id = 'tx-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'tx';
  root.innerHTML = `
    <canvas class="board"></canvas>
    <div class="flash"></div>
    <div class="top">
      <button class="btn" data-k="menu" aria-label="Fights">☰</button>
      <div class="names"><div class="title px"></div><div class="round px"></div></div>
      <div class="order"></div>
      <button class="btn" data-k="intents" title="Foes' intents">⇢</button>
      <button class="btn" data-k="threat" title="Threat">▦</button>
      <button class="btn" data-k="undo" title="Undo (Z)">↶</button>
      <button class="btn" data-k="log">Log</button>
      <button class="btn" data-k="set" aria-label="Settings">⚙</button>
    </div>
    <div class="readout frame"></div>
    <div class="banner"></div>
    <div class="log frame"></div>
    <button class="btn rotate">Across</button>
    <div class="pill">Confirm?</div>
    <div class="dock">
      <div class="info frame"></div>
      <div class="barrow">
        <button class="btn pager" data-k="prev" aria-label="Previous page">‹</button>
        <div class="slots"></div>
        <button class="btn pager" data-k="next" aria-label="Next page">›</button>
      </div>
    </div>
    <div class="scrim"></div>`;
  host.appendChild(root);
  const q = <T extends HTMLElement>(s: string): T => root.querySelector(s) as T;
  return {
    root,
    canvas: q('canvas.board'),
    title: q('.title'),
    round: q('.round'),
    order: q('.order'),
    readout: q('.readout'),
    info: q('.info'),
    slots: q('.slots'),
    prev: q('[data-k=prev]'),
    next: q('[data-k=next]'),
    pill: q('.pill'),
    rotate: q('.rotate'),
    scrim: q('.scrim'),
    log: q('.log'),
    banner: q('.banner'),
    flash: q('.flash'),
    logBtn: q('[data-k=log]'),
    setBtn: q('[data-k=set]'),
    menuBtn: q('[data-k=menu]'),
    intentsBtn: q('[data-k=intents]'),
    threatBtn: q('[data-k=threat]'),
    undoBtn: q('[data-k=undo]'),
  };
}
