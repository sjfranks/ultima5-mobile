/**
 * people.ts
 *
 * Who lives in Testhaven and what they say, and what lurks in the Old
 * Ruins and the Hollow beneath. Places are squares of the maps in
 * maps.ts; a level is 0, or 0xff for the Hollow (the ruins' level -1).
 */

import { ALL_DAY, type Conversation, type Person } from '../formats.ts';

/** Shop kinds (shops.ts): a merchant's talk number is 0x81 plus the kind. */
export const ARMOURY = 0;
export const TAVERN = 1;
export const HEALER = 6;

const stand = (tile: number, talk: number, x: number, y: number, z = 0): Person => ({
  tile,
  talk,
  places: [[x, y, z]],
  kinds: [0],
  times: ALL_DAY,
});
const wander = (tile: number, talk: number, x: number, y: number, kind = 1, z = 0): Person => ({
  tile,
  talk,
  places: [[x, y, z]],
  kinds: [kind],
  times: ALL_DAY,
});

/** Testhaven's people (TOWNE.NPC's first block). */
export const TOWNSFOLK: Person[] = [
  stand(0x54, 0x81 + ARMOURY, 4, 8), // Brann the smith, behind his counter
  stand(0x54, 0x81 + TAVERN, 26, 12), // Mira, behind the bar
  stand(0x54, 0x81 + HEALER, 5, 21), // Sister Ophe
  stand(0x40, 1, 25, 21), // Elder Wim, at his desk
  wander(0x70, 2, 14, 27), // Captain Hale, by the south gate
  wander(0x68, 3, 9, 15, 2), // Pip, running about
  wander(0x44, 4, 18, 17), // Lyra the bard, by the fountain
  stand(0x50, 5, 22, 8), // Old Noll, at a table in the Salty Gull
  wander(0x50, 6, 4, 14), // Marta, in her flowers
];

/** The Avatar's companions-to-be: the party's roster beyond the Avatar (start.ts), and where each waits. */
export const LYRA = { name: 'Lyra', gender: 0x0c, cls: 'B', str: 14, dex: 18, int: 16, hp: 45, level: 2, exp: 150 };

export const CONVERSATIONS: [number, Conversation][] = [
  [
    1,
    {
      name: 'Wim',
      look: 'a stooped old man with a long white beard and ink on his fingers.',
      greeting: 'Ah, {avatar}! Good to see you again.',
      job: "I'm the elder of Testhaven. I keep the town's books, and its stories.",
      bye: 'Mind how you go.',
      words: [
        [['town', 'testhave'], 'Small, but we like it. Fish, bread, and the odd adventurer. Have you met BRANN, our smith?'],
        [['story', 'stories', 'books'], 'The oldest story is of the RUINS on the hill, and the HOLLOW beneath them.'],
        [['ruins', 'hill'], 'North and east of town, past the path. A keep stood there once. Now it is all broken walls.'],
        [['hollow', 'cave'], 'Under the ruins is a cave we call the Hollow. Things live down there. Bats, goblins... worse.'],
        [['worse', 'troll'], 'They say a great TROLL keeps a hoard in the deepest part. Nobody who went looking has said much since.'],
        [['hoard', 'treasure'], 'Gold, they say, and a sword of glass. I would like to know if it is true. {ask:1}'],
        [['brann', 'smith'], 'Brann sells arms and armour, by the north gate. You will want some before the Hollow.'],
        [['ophe', 'healer'], 'Sister Ophe mends the hurt. Her house is on the west side of the square.'],
        [['lyra', 'bard'], 'Lyra sings by the fountain. She has wanted an adventure for years. Ask her to JOIN you.'],
      ],
      questions: [
        {
          n: 1,
          ask: 'Will you go and see for me?',
          otherwise: 'No? Well, take your time. The Hollow is not going anywhere.',
          answers: [
            ['yes', 'Bless you! Take a TORCH; it is dark down there. And come back alive.{give:69}'],
            ['y', 'Bless you! Take a TORCH; it is dark down there. And come back alive.{give:69}'],
          ],
        },
      ],
    },
  ],
  [
    2,
    {
      name: 'Captain Hale',
      look: 'a broad guard in a dented helm, leaning on a spear.',
      greeting: '{avatar}! Staying out of trouble?',
      job: 'I keep the watch. All of it. I am the watch.',
      bye: 'Move along, then.',
      words: [
        [['watch', 'guard'], 'Just me. Testhaven is a quiet town. Mostly I keep the GOBLINS out.'],
        [['goblin', 'goblins'], 'They come up out of the RUINS at night. Little green pests with big knives.'],
        [['ruins', 'hollow'], 'If you go up there, go armed. Brann will sell you a sword. Or a club, if you are poor.'],
        [['spear', 'helm'], 'Old, like me. Still works, like me.'],
        [['night', 'dark'], 'Things come out at night. Stay on the path and you will mostly be fine.'],
      ],
    },
  ],
  [
    3,
    {
      name: 'Pip',
      look: 'a muddy little boy with a stick for a sword.',
      greeting: "It's {avatar}! Did you fight anything yet?",
      job: "I'm a knight! Well, not yet. I'm practising.",
      bye: 'Bye! Watch out for TROLLS!',
      words: [
        [['knight', 'practice'], 'I hit the fence with my stick. The fence has never won. Not once.'],
        [['stick', 'sword'], 'Brann said he would make me a real sword when I am taller. I am taller now. Mostly.'],
        [['troll', 'trolls'], 'Old Noll says there is a troll under the hill as big as a house! He might have been making it up.'],
        [['noll', 'fish'], 'He sits in the SALTY GULL all day telling stories. Mum says not to listen.'],
        [
          ['salty', 'gull', 'tavern'],
          'Mira runs it. She makes fish pie. It is the best pie in the world. It is the only pie in the world.',
        ],
      ],
    },
  ],
  [
    4,
    {
      name: 'Lyra',
      look: 'a young woman with a lute on her back and a bow in her hand.',
      greeting: '{avatar}! Back for a song?',
      job: 'I sing, I play, and I shoot straight. I want an adventure worth a song.',
      bye: 'Fare you well!',
      words: [
        [['sing', 'song', 'lute'], 'Every song in Testhaven is about fish. I would like one about something else. Like a troll!'],
        [['adventur', 'join'], 'You mean it? {ask:2}'],
        [['troll', 'hollow'], 'The Hollow! Now that would make a song. Take me along and I will write it.'],
        [['shoot', 'bow'], 'I can hit a gull at forty paces. I would not, though. Gulls are friends.'],
      ],
      questions: [
        {
          n: 2,
          ask: 'Shall I come with you?',
          otherwise: 'Oh. Well, if you change your mind, I will be here. By the fountain. As always.',
          answers: [
            ['yes', 'Wonderful! Let me get my things.{join}'],
            ['y', 'Wonderful! Let me get my things.{join}'],
          ],
        },
      ],
    },
  ],
  [
    5,
    {
      name: 'Old Noll',
      look: 'a weathered old fisherman, nursing a mug.',
      greeting: 'Sit down, {avatar}, sit down.',
      job: 'I fished for fifty years. Now I sit. Sitting is better.',
      bye: 'Go on, then.',
      words: [
        [['fish', 'fished'], 'Biggest fish I ever caught was as long as this table. The one that got away was longer.'],
        [['troll', 'hollow'], 'I saw it once, the troll, in the Hollow. Big as a house. Well, a shed. A big shed.'],
        [['shed', 'house'], 'Fine, a dog kennel. But a very big troll for a dog kennel.'],
        [['sea', 'ships', 'storm'], 'No ship has come in years. Storms all round the island. We are on our own.'],
        [['mug', 'drink', 'ale'], 'Mira pours the ale. Buy a round and I might remember more stories.'],
      ],
    },
  ],
  [
    6,
    {
      name: 'Marta',
      look: 'a cheerful woman in a straw hat, with soil on her knees.',
      greeting: 'Hello again, {avatar}!',
      job: 'I grow the flowers. Somebody has to. Look how pretty they are!',
      bye: 'Stop and smell the flowers!',
      words: [
        [['flower', 'flowers'], 'Red ones, yellow ones, and some I have not named yet. Shall I name one after you?'],
        [['name', 'named'], "There! That one is {avatar}'s Bell. It is a bit scruffy, but so is everyone here."],
        [['ruins', 'hill'], 'Lovely wild flowers up by the ruins. I do not go any more. Too many SNAKES.'],
        [['snake', 'snakes'], 'Long green ones. Their bite makes you sick. Sister Ophe can cure that, for a price.'],
      ],
    },
  ],
];

// --- The Old Ruins and the Hollow ---------------------------------------------------------------------

const UNDER = 0xff;
const foe = (tile: number, x: number, y: number, z = UNDER, kind = 6): Person => ({
  tile,
  talk: 0,
  places: [[x, y, z]],
  kinds: [kind],
  times: ALL_DAY,
});
const chest = (x: number, y: number, z = UNDER): Person => ({ tile: 0x01, talk: 0, places: [[x, y, z]], kinds: [0], times: ALL_DAY });

/** KEEP.NPC's last block: the ruins' creatures and chests. */
export const RUINS_FOLK: Person[] = [
  // In the ruins above.
  foe(0xc8, 7, 7, 0, 1),
  foe(0x90, 20, 10, 0, 1),
  foe(0x90, 13, 5, 0, 1),
  chest(18, 5, 0),
  // In the Hollow.
  foe(0x94, 5, 5),
  foe(0x94, 24, 3),
  foe(0x98, 4, 10),
  foe(0x98, 27, 10),
  foe(0xa0, 13, 15),
  foe(0xc0, 20, 15),
  foe(0xc0, 23, 17),
  foe(0xc0, 5, 26),
  foe(0xc4, 25, 26),
  foe(0xc4, 28, 28),
  foe(0x90, 10, 18),
  foe(0xe4, 5, 28, UNDER, 1),
  chest(3, 3),
  chest(27, 4),
  chest(4, 27),
  chest(6, 28),
  chest(29, 26),
];

/** Of RUINS_FOLK, the creatures that come in a pack (D_28c6's bits: their fights are against a band). */
export const PACKS = RUINS_FOLK.map((p, i) => (p.tile >= 0x80 && p.tile !== 0xe4 ? i + 1 : 0)).filter((n) => n !== 0);
