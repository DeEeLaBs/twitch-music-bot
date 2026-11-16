import type {GameSettings} from '../chatGames.ts';
// Solutions stay in the server bundle, never in the shared overlay/browser module.
const ORIGINAL_GAMES:GameSettings={seconds:30,minimum:1,maximum:100,quizzes:[{id:'sky',question:'Welche Farbe entsteht aus Blau und Gelb?',answers:['Grün','Rot','Violett'],correct:0}],words:[{id:'rainbow',word:'Regenbogen',hint:'Erscheint manchmal nach dem Regen.'}],adventures:[{id:'forest',name:'Die Lichtung',entry:'start',scenes:[{id:'start',text:'Auf einer Lichtung findet ihr eine leuchtende Tür. Was tut ihr?',choices:[{text:'Die Tür öffnen',next:'door'},{text:'Dem Waldweg folgen',next:'path'}]},{id:'door',text:'Hinter der Tür wartet ein gemütliches Baumhaus. Ihr habt ein neues Zuhause gefunden!',choices:[]},{id:'path',text:'Der Weg führt zu einem See voller funkelnder Sterne. Ein guter Ort für eine Pause!',choices:[]}]}]};

const quizRows: [string, string, string[], number][] = [
  ['mars', 'Welcher Planet wird der Rote Planet genannt?', ['Venus', 'Mars', 'Jupiter', 'Merkur'], 1],
  ['octopus', 'Wie viele Arme hat ein Oktopus?', ['Sechs', 'Zehn', 'Acht', 'Zwölf'], 2],
  ['piano', 'Wie viele Tasten hat ein modernes Standardklavier?', ['88', '76', '61', '96'], 0],
  ['chess', 'Welche Schachfigur springt über andere Figuren?', ['Turm', 'Läufer', 'Dame', 'Springer'], 3],
  ['gold', 'Welches chemische Symbol steht für Gold?', ['Ag', 'Au', 'Fe', 'Cu'], 1],
  ['ocean', 'Welcher Ozean ist der größte?', ['Atlantik', 'Indischer Ozean', 'Pazifik', 'Arktischer Ozean'], 2],
  ['mario', 'Wie heißt Marios Bruder?', ['Toad', 'Yoshi', 'Wario', 'Luigi'], 3],
  ['spider', 'Wie viele Beine hat eine Spinne?', ['Acht', 'Sechs', 'Zehn', 'Vier'], 0],
  ['rome', 'Welche Zahl steht für das römische Zeichen L?', ['10', '50', '100', '500'], 1],
  ['moon', 'Wer betrat als erster Mensch den Mond?', ['Buzz Aldrin', 'Juri Gagarin', 'Neil Armstrong', 'Michael Collins'], 2],
  ['penguin', 'Welcher dieser Vögel kann nicht fliegen?', ['Amsel', 'Möwe', 'Falke', 'Pinguin'], 3],
  ['guitar', 'Wie viele Saiten hat eine gewöhnliche klassische Gitarre?', ['Sechs', 'Vier', 'Sieben', 'Acht'], 0],
  ['capital', 'Wie heißt die Hauptstadt von Kanada?', ['Toronto', 'Ottawa', 'Vancouver', 'Montréal'], 1],
  ['hexagon', 'Wie viele Ecken hat ein Hexagon?', ['Fünf', 'Sieben', 'Sechs', 'Acht'], 2],
  ['mining', 'In welchem Spiel begegnet man Creepern?', ['Terraria', 'Stardew Valley', 'Portal', 'Minecraft'], 3],
  ['heart', 'Wie viele Kammern hat das menschliche Herz?', ['Vier', 'Zwei', 'Drei', 'Sechs'], 0],
  ['bee', 'Wie nennt man einen männlichen Honigbienen-Nachkommen?', ['Arbeiter', 'Drohn', 'Soldat', 'Wächter'], 1],
  ['tempo', 'Was gibt BPM in der Musik an?', ['Lautstärke', 'Tonhöhe', 'Schläge pro Minute', 'Takte pro Lied'], 2],
  ['planet', 'Welcher Planet ist der größte im Sonnensystem?', ['Erde', 'Neptun', 'Saturn', 'Jupiter'], 3],
];

const wordRows = [
  ['compass', 'Kompass', 'Hilft bei der Orientierung und zeigt nach Norden.'],
  ['lighthouse', 'Leuchtturm', 'Warnt Schiffe mit Licht vor der Küste.'],
  ['avocado', 'Avocado', 'Grüne Frucht mit großem Kern, oft in Guacamole.'],
  ['hourglass', 'Sanduhr', 'Misst Zeit mit Körnern, die durch eine Engstelle rieseln.'],
  ['butterfly', 'Schmetterling', 'Dieses geflügelte Tier war einmal eine Raupe.'],
  ['headphones', 'Kopfhörer', 'Damit hörst du Musik, ohne den ganzen Raum zu beschallen.'],
  ['telescope', 'Teleskop', 'Damit beobachtet man weit entfernte Himmelskörper.'],
  ['popcorn', 'Popcorn', 'Knuspriger Kino-Snack aus aufgeplatzten Maiskörnern.'],
  ['penguin', 'Pinguin', 'Schwarz-weißer Vogel, der gut schwimmt.'],
  ['cactus', 'Kaktus', 'Speichert Wasser und hat meist Dornen.'],
  ['backpack', 'Rucksack', 'Eine Tasche, die du auf dem Rücken trägst.'],
  ['chessboard', 'Schachbrett', 'Darauf gibt es 64 helle und dunkle Felder.'],
  ['microphone', 'Mikrofon', 'Nimmt Stimme und Geräusche auf.'],
  ['volcano', 'Vulkan', 'Kann Lava und Asche ausstoßen.'],
  ['hammock', 'Hängematte', 'Schaukelnder Schlafplatz zwischen zwei Bäumen.'],
  ['snowflake', 'Schneeflocke', 'Ein filigraner Eiskristall, der vom Himmel fällt.'],
  ['controller', 'Controller', 'Mit Sticks und Tasten steuerst du ein Videospiel.'],
  ['campfire', 'Lagerfeuer', 'Wärmt beim Zelten und eignet sich für Stockbrot.'],
  ['jellyfish', 'Qualle', 'Durchsichtiges Meerestier mit Tentakeln.'],
  ['keyboard', 'Tastatur', 'Hier findest du Leertaste, Enter und Buchstaben.'],
  ['anchor', 'Anker', 'Hält ein Schiff an seinem Platz.'],
  ['hour', 'Wecker', 'Holt dich morgens mit einem Signal aus dem Schlaf.'],
  ['puzzle', 'Puzzle', 'Viele Teile ergeben zusammengesetzt ein Bild.'],
  ['satellite', 'Satellit', 'Umläuft einen Planeten und kann Signale übertragen.'],
];

export const DEFAULT_GAMES: GameSettings = {
  ...ORIGINAL_GAMES,
  quizzes: [...ORIGINAL_GAMES.quizzes, ...quizRows.map(([id, question, answers, correct]) => ({
    id: 'pack1-' + id, question, answers, correct,
  }))],
  words: [...ORIGINAL_GAMES.words, ...wordRows.map(([id, word, hint]) => ({
    id: 'pack1-' + id, word, hint,
  }))],
  adventures: [
    ...ORIGINAL_GAMES.adventures,
    {
      id: 'pack1-radio', name: 'Funksignal im Nebel', entry: 'start',
      scenes: [
        {id: 'start', text: 'Ein Fischerboot meldet sich im Nebel. Der Leuchtturm ist dunkel, am Kai liegt eine Signallampe. Wo helft ihr zuerst?', choices: [
          {text: 'Zum Leuchtturm laufen', next: 'tower'}, {text: 'Die Signallampe holen', next: 'pier'},
        ]},
        {id: 'tower', text: 'Im Turm findet ihr ein Ersatzkabel und ein Funkgerät. Die Zeit drängt.', choices: [
          {text: 'Das Licht reparieren', next: 'light'}, {text: 'Den sicheren Kurs durchfunken', next: 'radio'},
        ]},
        {id: 'pier', text: 'Die Lampe funktioniert. Am Kai entdeckt ihr auch eine Glocke, die im Nebel weit zu hören ist.', choices: [
          {text: 'Mit Licht den Kai markieren', next: 'light'}, {text: 'Mit der Glocke die Einfahrt markieren', next: 'bell'},
        ]},
        {id: 'light', text: 'Das Boot erkennt euer Licht und läuft sicher in den Hafen ein.', choices: []},
        {id: 'radio', text: 'Die Crew folgt eurem Kurs und erreicht einen geschützten Ankerplatz.', choices: []},
        {id: 'bell', text: 'Die Crew hört das Signal, findet die Einfahrt und macht am Kai fest.', choices: []},
      ],
    },
    {
      id: 'pack1-arcade', name: 'Die Arcade um Mitternacht', entry: 'start',
      scenes: [
        {id: 'start', text: 'Nach Ladenschluss leuchtet ein alter Spielautomat auf. Daneben liegt ein Zettel mit einer Zahlenfolge.', choices: [
          {text: 'Den Code am Automaten eingeben', next: 'machine'}, {text: 'Auf dem Zettel nach Hinweisen suchen', next: 'note'},
        ]},
        {id: 'machine', text: 'Der Automat öffnet ein Fach mit einem Messingschlüssel. Er passt entweder zur Vitrine oder zur Werkstatt.', choices: [
          {text: 'Die Vitrine öffnen', next: 'prize'}, {text: 'In die Werkstatt gehen', next: 'repair'},
        ]},
        {id: 'note', text: 'Auf der Rückseite steht: „Mein erster Highscore steht noch im Buch an der Kasse.“', choices: [
          {text: 'Das Highscore-Buch aufschlagen', next: 'book'}, {text: 'Den Code am Automaten testen', next: 'machine'},
        ]},
        {id: 'prize', text: 'In der Vitrine liegt eine Goldmarke für ein Freispiel. Ihr startet gemeinsam die Bonusrunde.', choices: []},
        {id: 'repair', text: 'In der Werkstatt entdeckt ihr einen zweiten Controller und repariert den Mehrspielermodus.', choices: []},
        {id: 'book', text: 'Ihr findet die Geschichte der ersten Spielerin und ergänzt euren eigenen Namen auf der letzten Seite.', choices: []},
      ],
    },
  ],
};

export function addGameContentPack(settings: GameSettings): GameSettings {
  function append<T extends {id: string}>(existing: T[], defaults: T[], limit: number): T[] {
    const ids = new Set(existing.map(entry => entry.id));
    const additions = defaults.filter(entry => entry.id.startsWith('pack1-') && !ids.has(entry.id));
    return [...existing, ...additions.slice(0, Math.max(0, limit - existing.length))];
  }

  return {
    ...settings,
    quizzes: append(settings.quizzes, DEFAULT_GAMES.quizzes, 1000),
    words: append(settings.words, DEFAULT_GAMES.words, 100),
    adventures: append(settings.adventures, DEFAULT_GAMES.adventures, 20),
  };
}
