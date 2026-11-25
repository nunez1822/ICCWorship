/**
 * The 66 books of the Protestant canon with English and Spanish names,
 * common abbreviations, and the ids used by OSIS / USFX source files.
 * Book numbers are 1-based (Genesis = 1, Revelation = 66).
 */
export interface BookInfo {
  num: number
  osis: string
  usfx: string
  en: string
  es: string
  /** extra names/abbreviations (lowercase, accents allowed — they are normalized) */
  alt: string[]
}

export const BOOKS: BookInfo[] = [
  { num: 1, osis: 'Gen', usfx: 'GEN', en: 'Genesis', es: 'Génesis', alt: ['gen', 'gn', 'ge'] },
  { num: 2, osis: 'Exod', usfx: 'EXO', en: 'Exodus', es: 'Éxodo', alt: ['ex', 'exo', 'exod', 'éx'] },
  { num: 3, osis: 'Lev', usfx: 'LEV', en: 'Leviticus', es: 'Levítico', alt: ['lev', 'lv', 'le'] },
  { num: 4, osis: 'Num', usfx: 'NUM', en: 'Numbers', es: 'Números', alt: ['num', 'nm', 'nu'] },
  { num: 5, osis: 'Deut', usfx: 'DEU', en: 'Deuteronomy', es: 'Deuteronomio', alt: ['deut', 'dt', 'deu', 'dtn'] },
  { num: 6, osis: 'Josh', usfx: 'JOS', en: 'Joshua', es: 'Josué', alt: ['josh', 'jos', 'jsh'] },
  { num: 7, osis: 'Judg', usfx: 'JDG', en: 'Judges', es: 'Jueces', alt: ['judg', 'jdg', 'jue', 'jc'] },
  { num: 8, osis: 'Ruth', usfx: 'RUT', en: 'Ruth', es: 'Rut', alt: ['ru', 'rt'] },
  { num: 9, osis: '1Sam', usfx: '1SA', en: '1 Samuel', es: '1 Samuel', alt: ['1 sam', '1 sa', '1 s', '1sm'] },
  { num: 10, osis: '2Sam', usfx: '2SA', en: '2 Samuel', es: '2 Samuel', alt: ['2 sam', '2 sa', '2 s', '2sm'] },
  { num: 11, osis: '1Kgs', usfx: '1KI', en: '1 Kings', es: '1 Reyes', alt: ['1 kgs', '1 ki', '1 kin', '1 re', '1 rey', '1 r'] },
  { num: 12, osis: '2Kgs', usfx: '2KI', en: '2 Kings', es: '2 Reyes', alt: ['2 kgs', '2 ki', '2 kin', '2 re', '2 rey', '2 r'] },
  { num: 13, osis: '1Chr', usfx: '1CH', en: '1 Chronicles', es: '1 Crónicas', alt: ['1 chr', '1 ch', '1 chron', '1 cr', '1 cro', '1 cron'] },
  { num: 14, osis: '2Chr', usfx: '2CH', en: '2 Chronicles', es: '2 Crónicas', alt: ['2 chr', '2 ch', '2 chron', '2 cr', '2 cro', '2 cron'] },
  { num: 15, osis: 'Ezra', usfx: 'EZR', en: 'Ezra', es: 'Esdras', alt: ['ezr', 'esd'] },
  { num: 16, osis: 'Neh', usfx: 'NEH', en: 'Nehemiah', es: 'Nehemías', alt: ['neh', 'ne'] },
  { num: 17, osis: 'Esth', usfx: 'EST', en: 'Esther', es: 'Ester', alt: ['est', 'esth', 'es'] },
  { num: 18, osis: 'Job', usfx: 'JOB', en: 'Job', es: 'Job', alt: ['jb'] },
  { num: 19, osis: 'Ps', usfx: 'PSA', en: 'Psalms', es: 'Salmos', alt: ['ps', 'psa', 'psalm', 'pss', 'sal', 'salmo', 'sl'] },
  { num: 20, osis: 'Prov', usfx: 'PRO', en: 'Proverbs', es: 'Proverbios', alt: ['prov', 'pr', 'pro', 'prv'] },
  { num: 21, osis: 'Eccl', usfx: 'ECC', en: 'Ecclesiastes', es: 'Eclesiastés', alt: ['eccl', 'ecc', 'ec', 'qoh', 'ecl'] },
  {
    num: 22,
    osis: 'Song',
    usfx: 'SNG',
    en: 'Song of Solomon',
    es: 'Cantares',
    alt: ['song', 'song of songs', 'sos', 'sng', 'cant', 'cnt', 'cantar de los cantares', 'ct']
  },
  { num: 23, osis: 'Isa', usfx: 'ISA', en: 'Isaiah', es: 'Isaías', alt: ['isa', 'is'] },
  { num: 24, osis: 'Jer', usfx: 'JER', en: 'Jeremiah', es: 'Jeremías', alt: ['jer', 'je', 'jr'] },
  { num: 25, osis: 'Lam', usfx: 'LAM', en: 'Lamentations', es: 'Lamentaciones', alt: ['lam', 'la', 'lm'] },
  { num: 26, osis: 'Ezek', usfx: 'EZK', en: 'Ezekiel', es: 'Ezequiel', alt: ['ezek', 'eze', 'ezk', 'ez'] },
  { num: 27, osis: 'Dan', usfx: 'DAN', en: 'Daniel', es: 'Daniel', alt: ['dan', 'dn', 'da'] },
  { num: 28, osis: 'Hos', usfx: 'HOS', en: 'Hosea', es: 'Oseas', alt: ['hos', 'ho', 'os'] },
  { num: 29, osis: 'Joel', usfx: 'JOL', en: 'Joel', es: 'Joel', alt: ['jl', 'joe'] },
  { num: 30, osis: 'Amos', usfx: 'AMO', en: 'Amos', es: 'Amós', alt: ['am', 'amo'] },
  { num: 31, osis: 'Obad', usfx: 'OBA', en: 'Obadiah', es: 'Abdías', alt: ['obad', 'ob', 'oba', 'abd'] },
  { num: 32, osis: 'Jonah', usfx: 'JON', en: 'Jonah', es: 'Jonás', alt: ['jon', 'jnh'] },
  { num: 33, osis: 'Mic', usfx: 'MIC', en: 'Micah', es: 'Miqueas', alt: ['mic', 'mi', 'miq'] },
  { num: 34, osis: 'Nah', usfx: 'NAM', en: 'Nahum', es: 'Nahúm', alt: ['nah', 'na'] },
  { num: 35, osis: 'Hab', usfx: 'HAB', en: 'Habakkuk', es: 'Habacuc', alt: ['hab', 'hb'] },
  { num: 36, osis: 'Zeph', usfx: 'ZEP', en: 'Zephaniah', es: 'Sofonías', alt: ['zeph', 'zep', 'sof'] },
  { num: 37, osis: 'Hag', usfx: 'HAG', en: 'Haggai', es: 'Hageo', alt: ['hag', 'hg'] },
  { num: 38, osis: 'Zech', usfx: 'ZEC', en: 'Zechariah', es: 'Zacarías', alt: ['zech', 'zec', 'zac'] },
  { num: 39, osis: 'Mal', usfx: 'MAL', en: 'Malachi', es: 'Malaquías', alt: ['mal', 'ml'] },
  { num: 40, osis: 'Matt', usfx: 'MAT', en: 'Matthew', es: 'Mateo', alt: ['matt', 'mt', 'mat'] },
  { num: 41, osis: 'Mark', usfx: 'MRK', en: 'Mark', es: 'Marcos', alt: ['mk', 'mrk', 'mr', 'mc', 'mar'] },
  { num: 42, osis: 'Luke', usfx: 'LUK', en: 'Luke', es: 'Lucas', alt: ['lk', 'luk', 'lc', 'luc'] },
  { num: 43, osis: 'John', usfx: 'JHN', en: 'John', es: 'Juan', alt: ['jn', 'jhn', 'joh', 'jua'] },
  { num: 44, osis: 'Acts', usfx: 'ACT', en: 'Acts', es: 'Hechos', alt: ['act', 'ac', 'hch', 'hech', 'hechos de los apóstoles'] },
  { num: 45, osis: 'Rom', usfx: 'ROM', en: 'Romans', es: 'Romanos', alt: ['rom', 'ro', 'rm'] },
  { num: 46, osis: '1Cor', usfx: '1CO', en: '1 Corinthians', es: '1 Corintios', alt: ['1 cor', '1 co'] },
  { num: 47, osis: '2Cor', usfx: '2CO', en: '2 Corinthians', es: '2 Corintios', alt: ['2 cor', '2 co'] },
  { num: 48, osis: 'Gal', usfx: 'GAL', en: 'Galatians', es: 'Gálatas', alt: ['gal', 'ga'] },
  { num: 49, osis: 'Eph', usfx: 'EPH', en: 'Ephesians', es: 'Efesios', alt: ['eph', 'ef', 'efe'] },
  { num: 50, osis: 'Phil', usfx: 'PHP', en: 'Philippians', es: 'Filipenses', alt: ['phil', 'php', 'flp', 'fil', 'fp'] },
  { num: 51, osis: 'Col', usfx: 'COL', en: 'Colossians', es: 'Colosenses', alt: ['col'] },
  { num: 52, osis: '1Thess', usfx: '1TH', en: '1 Thessalonians', es: '1 Tesalonicenses', alt: ['1 thess', '1 th', '1 tes', '1 ts'] },
  { num: 53, osis: '2Thess', usfx: '2TH', en: '2 Thessalonians', es: '2 Tesalonicenses', alt: ['2 thess', '2 th', '2 tes', '2 ts'] },
  { num: 54, osis: '1Tim', usfx: '1TI', en: '1 Timothy', es: '1 Timoteo', alt: ['1 tim', '1 ti', '1 tm'] },
  { num: 55, osis: '2Tim', usfx: '2TI', en: '2 Timothy', es: '2 Timoteo', alt: ['2 tim', '2 ti', '2 tm'] },
  { num: 56, osis: 'Titus', usfx: 'TIT', en: 'Titus', es: 'Tito', alt: ['tit', 'ti'] },
  { num: 57, osis: 'Phlm', usfx: 'PHM', en: 'Philemon', es: 'Filemón', alt: ['phlm', 'phm', 'flm', 'filem'] },
  { num: 58, osis: 'Heb', usfx: 'HEB', en: 'Hebrews', es: 'Hebreos', alt: ['heb', 'he'] },
  { num: 59, osis: 'Jas', usfx: 'JAS', en: 'James', es: 'Santiago', alt: ['jas', 'jm', 'stg', 'sant', 'sgo'] },
  { num: 60, osis: '1Pet', usfx: '1PE', en: '1 Peter', es: '1 Pedro', alt: ['1 pet', '1 pe', '1 pt', '1 ped'] },
  { num: 61, osis: '2Pet', usfx: '2PE', en: '2 Peter', es: '2 Pedro', alt: ['2 pet', '2 pe', '2 pt', '2 ped'] },
  { num: 62, osis: '1John', usfx: '1JN', en: '1 John', es: '1 Juan', alt: ['1 jn', '1 jhn', '1 jua'] },
  { num: 63, osis: '2John', usfx: '2JN', en: '2 John', es: '2 Juan', alt: ['2 jn', '2 jhn', '2 jua'] },
  { num: 64, osis: '3John', usfx: '3JN', en: '3 John', es: '3 Juan', alt: ['3 jn', '3 jhn', '3 jua'] },
  { num: 65, osis: 'Jude', usfx: 'JUD', en: 'Jude', es: 'Judas', alt: ['jud', 'jd'] },
  { num: 66, osis: 'Rev', usfx: 'REV', en: 'Revelation', es: 'Apocalipsis', alt: ['rev', 're', 'rv', 'ap', 'apoc', 'apocalypse', 'revelations'] }
]

/** Lowercase, strip accents and punctuation, collapse spaces. Also normalizes roman numerals / ordinals for 1-3. */
export function normalizeBookName(s: string): string {
  let n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  n = n
    .replace(/^(iii|3ro|3er|3rd|tercera|third)\s*/, '3 ')
    .replace(/^(ii|2do|2nd|segunda|segundo|second)\s*/, '2 ')
    .replace(/^(i|1ro|1er|1st|primera|primero|first)\s+/, '1 ')
    .replace(/^([123])\s*/, '$1 ')
  return n.trim()
}

const lookup = new Map<string, BookInfo>()
for (const b of BOOKS) {
  for (const name of [b.en, b.es, b.osis, b.usfx, ...b.alt]) {
    lookup.set(normalizeBookName(name), b)
  }
}

/** Find a book by any English/Spanish name or abbreviation. Falls back to unique prefix match. */
export function findBook(name: string): BookInfo | undefined {
  const n = normalizeBookName(name)
  if (!n) return undefined
  const exact = lookup.get(n)
  if (exact) return exact
  if (n.length < 2) return undefined
  // unique prefix match on full names
  const candidates = new Set<BookInfo>()
  for (const [key, b] of lookup) {
    if (key.startsWith(n)) candidates.add(b)
  }
  if (candidates.size === 1) return [...candidates][0]
  return undefined
}

export function bookByNum(num: number): BookInfo | undefined {
  return BOOKS[num - 1]
}

export function bookName(num: number, lang: 'en' | 'es'): string {
  const b = BOOKS[num - 1]
  return b ? b[lang] : '?'
}
