/**
 * shops.ts
 *
 * Testhaven's shops: Brann's arms, Mira's tavern the Salty Gull, and
 * Sister Ophe's Mending House - their names, keepers, wares and prices in
 * DATA.OVL, and what their keepers say, most of it in SHOPPE.DAT (the
 * engine's game/shops.ts reads both). In the shop's words # is the shop,
 * $ the keeper, @ the time of day, % a price, ^ a count, & and * names.
 */

import type { OvlBuilder } from '../ovl.ts';
import { TOWN_ID } from './ovl.ts';
import { ARMOURY, HEALER, TAVERN } from './people.ts';

/** SHOPPE.DAT, written: a few messages where the engine reads them by their place in the file, the rest after. */
class Shoppe {
  readonly bytes = new Uint8Array(0x8000);
  private next = 0x2400;
  private readonly used: [number, number][] = [];

  at(offset: number, text: string): number {
    const n = text.length + 1;
    if (offset + n > this.bytes.length) throw new Error('SHOPPE.DAT is full');
    for (const [a, len] of this.used)
      if (offset < a + len && a < offset + n) throw new Error(`SHOPPE.DAT 0x${offset.toString(16)} overlaps`);
    this.used.push([offset, n]);
    for (let i = 0; i < text.length; i++) this.bytes[offset + i] = text.charCodeAt(i) & 0x7f;
    return offset;
  }

  add(text: string): number {
    const at = this.at(this.next, text);
    this.next += text.length + 1;
    return at;
  }
}

/** What Brann sells (by arm, ovl.ts ARMS), up to seven, and every arm's price. */
const WARES = [23, 30, 26, 27, 10, 13, 5];
const PRICES: Record<number, number> = {
  0: 20,
  1: 50,
  2: 90,
  3: 150,
  4: 15,
  5: 60,
  6: 110,
  7: 300,
  8: 600,
  9: 10,
  10: 30,
  11: 90,
  12: 160,
  13: 260,
  14: 600,
  15: 1200,
  16: 5,
  17: 15,
  18: 8,
  19: 12,
  20: 25,
  21: 30,
  22: 35,
  23: 45,
  24: 60,
  25: 80,
  26: 70,
  27: 1,
  28: 140,
  29: 2,
  30: 120,
  31: 160,
  32: 200,
  33: 260,
  34: 300,
  35: 10,
  36: 500,
  37: 600,
  38: 700,
  39: 2000,
  40: 1500,
  41: 3000,
  42: 800,
  43: 600,
  44: 900,
  45: 200,
  46: 50,
  47: 400,
};
/** What Brann says of each, when it is chosen. */
const PITCH: Record<number, string> = {
  23: 'A short sword. Quick, light, and it keeps its edge.',
  30: 'The broadsword! My best work. It will go through a goblin like butter.',
  26: 'A good yew bow. You will need arrows, mind.',
  27: 'Arrows, a bundle of them, fletched with gull feathers.',
  10: 'A leather jerkin, boiled and stitched. Better than a shirt.',
  13: "Chain mail. Heavy, but it will turn a troll's club. Mostly.",
  5: 'A kite shield, oak and iron. Hold it up, not down.',
};

export function testShops(o: OvlBuilder): Uint8Array {
  const f = new Shoppe();
  const kinds = 8;
  // D_23ca, D_21ca, D_22ca: which places have a shop of each kind, the shops' names and their keepers.
  for (let k = 0; k < kinds; k++) {
    const maps = new Uint8Array(16);
    const names = Array<string>(16).fill('');
    const keepers = Array<string>(16).fill('');
    const own = {
      [ARMOURY]: ["Brann's Arms", 'Brann'],
      [TAVERN]: ['The Salty Gull', 'Mira'],
      [HEALER]: ['The Mending House', 'Sister Ophe'],
    }[k];
    if (own) {
      maps[0] = TOWN_ID;
      [names[0], keepers[0]] = own;
    }
    o.bytes(0x23ca + k * 16, maps, 'shop places');
    o.table(0x21ca + k * 32, names, 'shop names');
    o.table(0x22ca + k * 32, keepers, 'shop keepers');
  }
  // D_3b2a, D_3b6a, D_3baa: each kind's greetings, and its partings without a sale and after one.
  const greet: Record<number, string[]> = {
    [TAVERN]: ['Welcome to #! Hungry?', 'Come in, come in! Something to eat?', 'Sit anywhere you like. Hungry?', 'Good @! Will you eat?'],
    [HEALER]: [
      'Peace be with you. Are you hurt?',
      'Welcome to #. Do you need healing?',
      'Come in, child. Are you unwell?',
      'Good @. Do you need my help?',
    ],
  };
  const bye = ['Come again!', 'Safe travels.', 'Mind the goblins.', 'Off you go, then.'];
  const thanks = ['Thank you kindly!', 'Pleasure doing business.', 'Come back soon!', 'Good luck out there!'];
  for (let k = 0; k < kinds; k++) {
    const hello = greet[k] ?? ['Hello! Can I help?', 'Welcome! Buying?', 'Good @! Can I help?', 'Yes?'];
    o.words(
      0x3b2a + k * 8,
      hello.map((t) => f.add(t)),
      'greetings',
    );
    o.words(
      0x3b6a + k * 8,
      bye.map((t) => f.add(`${t}"`)),
      'partings',
    );
    o.words(
      0x3baa + k * 8,
      thanks.map((t) => f.add(`${t}"`)),
      'thanks',
    );
  }
  armoury(o, f);
  healer(o);
  tavern(o, f);
  others(o, f);
  // The common words of every shop (shops.ts greet, part, yesNoEcho).
  o.text(0x784c, '\n\n:');
  o.text(0x7850, '\n:');
  o.text(0x7854, '\n\n"');
  o.text(0x7858, '\n\n"');
  o.text(0x785c, 'says $.\n');
  o.text(0x7866, 'No');
  o.text(0x786a, 'Yes');
  o.text(0x7826, 'morning');
  o.text(0x782e, 'afternoon');
  o.text(0x7838, 'evening');
  o.text(0x78c0, 'madam');
  o.text(0x78c8, 'sir');
  o.text(0x9072, 'A shopkeeper says:\n"No horses in here!"\n');
  o.text(0x953c, 'Not dead!\n');
  return f.bytes;
}

function armoury(o: OvlBuilder, f: Shoppe): void {
  o.words(
    0x3a82,
    Array.from({ length: 0x30 }, (_, i) => PRICES[i] ?? 50),
    'arm prices',
  );
  const wares = new Uint8Array(9 * 8).fill(0xff);
  wares.set(WARES, 0);
  o.bytes(0x3ae2, wares, 'arm wares');
  o.words(
    0x3c48,
    Array.from({ length: 0x2f }, (_, i) => f.add(PITCH[i] ?? 'A fine piece of work, if I say so myself.')),
    'arm pitches',
  );
  o.table(0x3ca6, ['Want it for % gold?', 'Yours for % gold. Yes?', '% gold. Deal?', 'I could let it go for % gold. Well?'], 'arm asks');
  o.table(0x3cae, ["You can't afford it!", 'Come back with more gold!', 'That is not enough gold!', 'Gold first, friend!'], 'arm refusals');
  o.table(0x3cb6, ['What will it be?', 'Which one?', 'See anything you like?', 'Take your pick.'], 'arm choices');
  o.words(
    0x3cbe,
    [
      'I can give you % gold for your &.',
      'Your &? % gold.',
      '% gold for the &, and not a coin more.',
      'That &... % gold.',
      'I will take the & for % gold.',
      '% gold, for an old &.',
      'The & is worth % gold to me.',
      '& - % gold.',
    ].map((t) => f.add(t)),
    'sell offers',
  );
  o.words(0x3cce, Array<number>(0x30).fill(0), 'sell names');
  o.table(0x3d2e, ['What are you selling?', 'Let me see it.', 'What have you got?', 'Show me.'], 'sell asks');
  o.table(0x3d36, ['Good doing business', 'Fair enough', 'Right then', 'All done, then'], 'sell ends');
  o.table(0x3d3e, ['Anything else to sell?', 'More?', 'What else?', 'Something else?'], 'sell more');
  o.table(0x3d46, ['Buying or selling?', 'Here to buy, or to sell?'], 'arm opening');
  o.table(0x3d4a, ['Good choice. ', 'Splendid! ', 'Ah, a buyer! ', 'Very good. '], 'buy opening');
  o.table(0x3d52, ['Here is what I have:', 'Have a look:', 'All my own work:', 'Fresh from the anvil:'], 'buy list');
  const texts: Record<number, string> = {
    0x7b5e: '\n\n"',
    0x7b62: '\n\n',
    0x7b66: '" ',
    0x7b6a: 'No\n\n',
    0x7b70: 'Yes\n',
    0x7b76: '\n"You can\'t carry any more!"\n',
    0x7b9a: 'says $.\n\n',
    0x7ba4: '\n"',
    0x7ba8: '"\nsays $.\n',
    0x7bb4: '\nSold!\n',
    0x7bbc: '"Anything else,\n',
    0x7bce: 'madam?',
    0x7bd6: 'sir?',
    0x7bdc: 'then?',
    0x7c44: '\n\n',
    0x7c48: '..',
    0x7c4c: '" ',
    0x7c50: '              ',
    0x7d32: '\n\n"I don\'t buy used arrows!"\nsays $.\n',
    0x7d64: '\n\n"',
    0x7d68: '\n\nDeal?" ',
    0x7d72: 'No',
    0x7d76: 'Yes\n\n"Done!"\nsays $.',
    0x7d8c: 'I can\'t buy that from you."\nsays $.',
    0x7ef0: '" ',
    0x7ef4: 'Arms',
    0x7f06: '\n\n"',
    0x7f0a: '" ',
    0x7f0e: '\n\n"',
    0x7f12: '"\n',
    0x7f16: 'says $.\n',
    0x7f20: 'You have nothing to sell!"\nsays $.\n',
    0x8018: '"Good @, and welcome to #!"\n',
    0x8036: '\n$ says,\n"',
    0x8042: '" ',
    0x8046: 'Buy\n\n"',
    0x804e: 'Sell\n\n"',
    0x8056: 'No',
  };
  for (const [a, t] of Object.entries(texts)) o.text(Number(a), t);
}

function healer(o: OvlBuilder): void {
  // D_3d8e, D_3d86, D_3d96: what each healer asks to cure, to heal and to raise the dead.
  o.bytes(0x3d8e, [20, 0, 0, 0, 0, 0, 0, 0], 'cure prices');
  o.bytes(0x3d86, [30, 0, 0, 0, 0, 0, 0, 0], 'heal prices');
  o.words(0x3d96, [250, 0, 0, 0, 0, 0, 0, 0], 'raise prices');
  const texts: Record<number, string> = {
    0x3d5a: '"You have no need of that!" says $.',
    0x805a: '\n\n"Who needs my help?" ',
    0x8072: 'No one',
    0x807a: 'for % gold.\n\nWill you\npay?" ',
    0x8098: 'Yes',
    0x809c: 'No',
    0x80a0: 'No',
    0x80a4: 'Yes\n\n',
    0x80aa: '"I can Cure poison, Heal wounds, or Raise the dead."\n',
    0x80da: 'says $.\n\n"What do you need?" ',
    0x8106: 'Cure',
    0x810e: '\n\n"',
    0x8112: 'Be well!"',
    0x812a: 'I can cure that poison ',
    0x8148: 'Heal',
    0x8150: '\n\n"',
    0x8154: 'Be well!"',
    0x816c: 'I can heal you ',
    0x817e: 'Raise',
    0x8188: '\n\n"',
    0x818c: 'I can bring this poor soul back from ',
    0x81b6: 'the dead ',
    0x81c0: 'Nothing',
    0x81c8: '\n\n"Can I help you with\n',
    0x81f2: 'anything else?" ',
  };
  for (const [a, t] of Object.entries(texts)) o.text(Number(a), t);
}

/** The Salty Gull's gossip: what is asked about, who it is about, and who knows. */
const GOSSIP: [string, string, string, number][] = [
  ['TROLL', 'the troll', 'Old Noll', 10],
  ['RUINS', 'the ruins', 'Elder Wim', 5],
  ['HOLLOW', 'the Hollow', 'Elder Wim', 5],
  ['LYRA', 'Lyra', 'the fountain', 5],
  ['SWORD', 'the glass sword', 'the troll', 20],
  ['GOBLIN', 'the goblins', 'Captain Hale', 5],
];

function tavern(o: OvlBuilder, f: Shoppe): void {
  // D_4d4c: each tavern's menu (one of four); D_4c1e, D_4c24, D_4c2a, D_4c30: the menus' letters for a meal for all,
  // a drink (W a wine list), food to take away, and gossip.
  o.bytes(0x4d4c, new Uint8Array(10), 'tavern menus');
  o.bytes(0x4c1e, [0x46, 0x46, 0x46, 0x46, 0], 'meal keys');
  o.bytes(0x4c24, [0x41, 0x41, 0x41, 0x41, 0], 'drink keys');
  o.bytes(0x4c2a, [0x52, 0x52, 0x52, 0x52, 0], 'ration keys');
  o.bytes(0x4c30, [0x47, 0x47, 0x47, 0x47, 0], 'gossip keys');
  o.words(0x4c36, [4, 4, 4, 4, 4, 4, 4, 4, 4], 'meal prices');
  o.words(0x4c48, [10, 20, 30, 40, 50, 60], 'wine prices');
  o.words(0x4c54, [12, 12, 12, 12, 12, 12, 12, 12, 12], 'ration prices');
  o.words(
    0x4c66,
    [
      'Fish pie, wrapped to go. % gold for a pack of 25.',
      'Bread, cheese and dried fish: % gold a pack.',
      'Travel rations, % gold each. They keep for weeks.',
      'Ship biscuit and salt fish. % gold.',
      'Pie for the road? % gold a pack.',
      "Mira's own rations, % gold.",
      '% gold a pack, and worth it.',
    ].map((t) => f.add(t)),
    'ration offers',
  );
  o.words(
    0x4d56,
    [0, 1, 2, 3].map(() => f.add('We have Fish pie for everyone, Ale, Rations to take with you, or Gossip.')),
    'tavern menu',
  );
  o.words(
    0x4d5e,
    [0, 1, 2, 3].map(() => f.add('Fish pie, Ale, Rations, or Gossip?')),
    'tavern again',
  );
  // Gossip: the words, the subject (&), its index into the names of who knows (*), and the price.
  const topics = Array<string>(0x1a).fill('');
  const subjects = Array<string>(0x1a).fill('');
  const who = new Uint8Array(0x1a);
  const prices = Array<number>(0x1a).fill(0);
  const knowers = Array<string>(0xd).fill('');
  GOSSIP.forEach(([word, subject, knower, price], i) => {
    topics[i] = word;
    subjects[i] = subject;
    who[i] = i;
    knowers[i] = knower;
    prices[i] = price;
  });
  o.table(0x4c74, topics, 'gossip words');
  o.table(0x4ca8, subjects, 'gossip subjects');
  o.bytes(0x4cdc, who, 'gossip knowers');
  o.table(0x4cf6, knowers, 'knowers');
  o.words(0x4d10, prices, 'gossip prices');
  o.words(
    0x4d44,
    [
      'Ask * about &. That is all I know.',
      'If it is & you want, talk to *.',
      '* knows more about & than I do.',
      'For &? Go and see *.',
    ].map((t) => f.add(`"${t}"`)),
    'gossip',
  );
  // Read where the engine reads them.
  f.at(0x134e, '"Hmm, my memory is foggy. % gold might clear it."');
  f.at(0x1413, '\n\n"Suit yourself!"\n');
  f.at(0x143f, '"You can\'t pay for that! Out!"\nsays $.\n');
  f.at(0x146a, ',\nI only talk to PAYING customers!"\nsays $.\n');
  const texts: Record<number, string> = {
    // The number at the table (shops.ts payRound): one is read from the segment's first string.
    0x0000: 'one',
    0x9aa8: 'two',
    0x9aac: 'three',
    0x9ab2: 'four',
    0x9ab8: 'five',
    0x9abe: 'six',
    0x9ac2: 'sir',
    0x9ac6: 'madam',
    0x9ace: 'That will be ',
    0x9adc: ' gold, for ',
    0x9aec: ' at the table,\n',
    0x9af6: '"\n\n"CAN\'T PAY?\nOut!"\nsays ',
    0x9b16: '\nEnjoy!"\n\n',
    0x9b22: '\n\n"Excuse me, ',
    0x9b38: ',"\nsays ',
    0x9b42: '.\n"But haven\'t\nyou had enough\nto drink?" ',
    0x9b6c: 'Yes\n\n',
    0x9b72: 'No!',
    0x9b76: '"Our wines,\n',
    0x9b88: '.\n\n',
    0x9b8c: 'A Red     10\n',
    0x9b9e: 'B White   20\n',
    0x9bb0: 'C Rose    30\n',
    0x9bc2: 'D Port    40\n',
    0x9bd4: 'E Mead    50\n',
    0x9be6: 'F Brandy  60\n',
    0x9bfa: 'Which?" ',
    0x9c08: '\n\n"Good choice, ',
    0x9c20: '"\n\n"CAN\'T PAY?\nOut!"\nsays ',
    0x9c40: '\nEnjoy!"',
    0x9c4a: '\n\nHow many\npacks?" ',
    0x9c6a: '\n\n"Hmph."',
    0x9c76: '\n\n',
    0x9c7a: '"You have\nno gold and no\nneed! Out!"\n',
    0x9ca4: 'says ',
    0x9cac: '.\n',
    0x9cb0: '"You can only\nafford ',
    0x9cca: '!"\n\n',
    0x9cd0: '\n\n',
    0x9efc: '\n\n"',
    0x9f00: 'What do you\nwant to hear\nabout, ',
    0x9f24: '?"\n\nYou say:\n',
    0x9f36: '\n\n',
    0x9f3a: '"I don\'t know about that.\n\n',
    0x9f5c: '\n\nFair?" ',
    0x9f6c: 'No\n\n',
    0x9f72: 'Yes\n\n',
    0x9f78: '"Sorry, ',
    0x9f82: '\nsays ',
    0x9f8a: '.\n\n',
    0x9f8e: 'No',
    0x9f92: 'Yes\n\n"',
    0x9f9a: '"Anything else\nfor you?" ',
    0x9fb6: 'No',
    0x9fba: 'Yes\n\n"',
  };
  for (const [a, t] of Object.entries(texts)) o.text(Number(a), t);
}

/** The shops Test has none of: their tables in place (empty), and the few words read where the engine reads them. */
function others(o: OvlBuilder, f: Shoppe): void {
  o.words(0x3c0a, [0, 0, 0], 'guild offers');
  o.words(0x3c10, Array<number>(8).fill(0), 'reagent offers');
  for (const at of [0x1643, 0x183e, 0x188c, 0x18eb, 0x193b, 0x19f2, 0x1a50, 0x1a67 + 0x4c4, 0x21e6, 0x2215, 0x23ab]) {
    f.at(at, at === 0x23ab ? '\n\n"Then I cannot help you."\nsays $.' : '"Not today."');
  }
}
