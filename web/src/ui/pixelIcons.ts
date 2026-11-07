/**
 * pixelIcons.ts
 *
 * The touch bar's and the tabs' symbols (the mobile fork's: touchBar.ts, paneTabs.ts), drawn square by square as the
 * game's own letters are, eight by eight, so that they sit with the lettering on the buttons rather than a phone's
 * own glyphs: the Pause menu's bars, the arrows, a sword for Attack and a turn back for Back where the buttons are
 * many (the words too long for their buttons at the log's size). Each is filled in the button's own colour (currentColor).
 */

/** Each symbol, its rows top to bottom: '#' for a filled square. */
const ICONS = {
  menu: ['........', '.######.', '.######.', '........', '.######.', '.######.', '........', '.######.', '.######.'],
  up: ['........', '...##...', '..####..', '.######.', '########', '........', '........', '........'],
  down: ['........', '........', '........', '########', '.######.', '..####..', '...##...', '........'],
  left: ['....#...', '...##...', '..###...', '.####...', '.####...', '..###...', '...##...', '....#...'],
  right: ['...#....', '...##...', '...###..', '...####.', '...####.', '...###..', '...##...', '...#....'],
  sword: ['......##', '.....###', '....###.', '#..###..', '.####...', '..##....', '.#.##...', '#...#...'],
  back: ['..#.....', '.##.....', '#######.', '.##....#', '..#....#', '.......#', '..#####.', '........'],
} as const;

export type Icon = keyof typeof ICONS;

/** A symbol as an SVG `size` CSS pixels high (and as wide as its rows are, in proportion), its squares crisp. */
export function pixelIcon(name: Icon, size: number): SVGSVGElement {
  const rows = ICONS[name];
  const w = rows[0].length;
  const h = rows.length;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', `${(size * w) / h}`);
  svg.setAttribute('height', `${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  const path = document.createElementNS(ns, 'path');
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      // A run of filled squares as one rectangle.
      let end = x;
      while (end + 1 < row.length && row[end + 1] === '#') end++;
      d += `M${x} ${y}h${end - x + 1}v1h${-(end - x + 1)}z`;
      x = end;
    }
  });
  path.setAttribute('d', d);
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}
