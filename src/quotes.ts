export interface BotQuote {
  de: string;
  en: string;
  origin?: string;
}

export const BOT_QUOTES: BotQuote[] = [
  {
    de: '„Der Kuchen ist eine Lüge.“',
    en: '"The cake is a lie."',
    origin: 'Portal'
  },
  {
    de: '„Es ist gefährlich, alleine zu gehen! Nimm diesen Beat.“',
    en: '"It\'s dangerous to go alone! Take this beat."',
    origin: 'The Legend of Zelda'
  },
  {
    de: '„Früher war ich auch ein Abenteurer, aber dann habe ich einen Pfeil ins Knie bekommen.“',
    en: '"I used to be an adventurer like you, then I took an arrow in the knee."',
    origin: 'The Elder Scrolls V: Skyrim'
  },
  {
    de: '„Bleibt ein Weilchen und hört zu!“',
    en: '"Stay awhile and listen!"',
    origin: 'Diablo'
  },
  {
    de: '„Du kämpfst wie eine Kuh!“ – „Wie passend, du kämpfst wie eine Melkerin!“',
    en: '"You fight like a dairy farmer!" – "How appropriate, you fight like a cow!"',
    origin: 'The Secret of Monkey Island'
  },
  {
    de: '„Praise the Sun! \\[T]/“',
    en: '"Praise the Sun! \\[T]/"',
    origin: 'Dark Souls'
  },
  {
    de: '„Krieg... Krieg bleibt immer gleich. Aber die Playlist ändert sich.“',
    en: '"War. War never changes. But the playlist does."',
    origin: 'Fallout'
  },
  {
    de: '„Danke Mario! Aber unsere Prinzessin ist in einem anderen Schloss.“',
    en: '"Thank you Mario! But our princess is in another castle."',
    origin: 'Super Mario Bros.'
  },
  {
    de: '„Ich bin hier, um Kaugummi zu kauen und Tracks zu pumpen... und der Kaugummi ist alle.“',
    en: '"It\'s time to kick ass and play tracks... and I\'m all outta gum."',
    origin: 'Duke Nukem'
  },
  {
    de: '„Mach eine Fassrolle!“',
    en: '"Do a barrel roll!"',
    origin: 'Star Fox 64'
  },
  {
    de: '„Schlange? Schlange?! SCHLAAANGE!“',
    en: '"Snake? Snake?! SNAAAAKE!"',
    origin: 'Metal Gear Solid'
  },
  {
    de: '„Ich bin Commander Shepard und dies ist mein Lieblings-Musikbot auf der Citadel.“',
    en: '"I\'m Commander Shepard, and this is my favorite music bot on the Citadel."',
    origin: 'Mass Effect'
  },
  {
    de: '„Wärst du so freundlich, diesen Track zu genießen?“',
    en: '"Would you kindly enjoy this track?"',
    origin: 'BioShock'
  },
  {
    de: '„Wach auf, Samurai, wir haben eine Playlist zu brennen.“',
    en: '"Wake up, Samurai, we have a playlist to burn."',
    origin: 'Cyberpunk 2077'
  },
  {
    de: '„Grabe niemals gerade nach unten... außer beim Bass-Drop!“',
    en: '"Never dig straight down... unless the bass is dropping!"',
    origin: 'Minecraft'
  },
  {
    de: '„Wind heult... und der Beat sitzt.“',
    en: '"Wind\'s howling... and the beat is fresh."',
    origin: 'The Witcher 3'
  },
  {
    de: '„Ein wilder Songwunsch erscheint!“',
    en: '"A wild song request appears!"',
    origin: 'Pokémon'
  },
  {
    de: '„Rip and Tear, bis die Playlist leer ist.“',
    en: '"Rip and tear, until the playlist is done."',
    origin: 'DOOM'
  },
  {
    de: '„Ah shit, here we go again.“',
    en: '"Ah shit, here we go again."',
    origin: 'GTA San Andreas'
  },
  {
    de: '„Das war ein Triumph! Riesen-Erfolg.“',
    en: '"This was a triumph! Huge success."',
    origin: 'Portal'
  },
  {
    de: '„Drop den Bass, nicht die Frames!“',
    en: '"Drop the bass, not the frames!"',
    origin: 'Twitch Proverb'
  },
  {
    de: '„Wer hat diesen Song geskippt? Das war ziemlich sus.“',
    en: '"Who skipped this song? That was pretty sus."',
    origin: 'Among Us'
  },
  {
    de: '„Der richtige Song am richtigen Ort kann den ganzen Stream verändern.“',
    en: '"The right song in the right place can make all the difference in the stream."',
    origin: 'Half-Life 2'
  },
  {
    de: '„Finish Him! Flawless Victory.“',
    en: '"Finish Him! Flawless Victory."',
    origin: 'Mortal Kombat'
  }
];

export function getRandomQuoteIndex(): number {
  return Math.floor(Math.random() * BOT_QUOTES.length);
}
