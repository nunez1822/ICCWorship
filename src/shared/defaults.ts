import type { ServicePlan, Settings, Song, Team, Theme } from './types'

export const DEFAULT_SETTINGS: Settings = {
  uiLang: 'es',
  displayLang: 'both',
  bilingualOrder: 'es-first',
  churchName: 'ICC',
  outputEnabled: true,
  defaultThemeId: 'theme-classic',
  serverEnabled: true,
  serverPort: 7272,
  remotePin: '',
  bibleEn: 'kjv',
  bibleEs: 'rv1909',
  messageTemplates: [
    { id: 'msg-nursery', en: 'Parent of child #{n}, please come to the nursery', es: 'Padre/madre del niño #{n}, favor de pasar a la guardería' },
    { id: 'msg-car', en: 'Vehicle {n}: your lights are on', es: 'Vehículo {n}: tiene las luces encendidas' },
    { id: 'msg-silence', en: 'Please silence your phones', es: 'Por favor silencie su teléfono' }
  ],
  messageSeconds: 30,
  operatorTheme: 'dark',
  firstRunDone: false,
  checkForUpdates: false,
  disableHwAccel: false
}

const base = {
  fontFamily: 'Segoe UI',
  fontSize: 72,
  secondaryScale: 0.78,
  shadow: true,
  outline: false,
  uppercase: false,
  bold: true,
  align: 'center' as const,
  position: 'middle' as const,
  builtIn: true
}

export const DEFAULT_THEMES: Theme[] = [
  {
    ...base,
    id: 'theme-classic',
    name: 'Classic Night / Noche Clásica',
    color: '#ffffff',
    secondaryColor: '#f6d58e',
    background: { type: 'gradient', value: 'radial-gradient(ellipse at 50% 30%, #1d3557 0%, #0b1324 70%, #05080f 100%)' }
  },
  {
    ...base,
    id: 'theme-sunrise',
    name: 'Sunrise / Amanecer',
    color: '#ffffff',
    secondaryColor: '#ffe7c2',
    background: { type: 'gradient', value: 'linear-gradient(160deg, #3a1c71 0%, #d76d77 55%, #ffaf7b 100%)' }
  },
  {
    ...base,
    id: 'theme-clean',
    name: 'Clean Light / Claro',
    color: '#101828',
    secondaryColor: '#475467',
    shadow: false,
    background: { type: 'color', value: '#f8f7f3' }
  },
  {
    ...base,
    id: 'theme-gold',
    name: 'Midnight Gold / Oro',
    fontFamily: 'Georgia',
    bold: false,
    color: '#f3d27a',
    secondaryColor: '#e8e8e8',
    background: { type: 'color', value: '#000000' }
  },
  {
    ...base,
    id: 'theme-lower',
    name: 'Lower Third / Tercio Inferior',
    fontSize: 54,
    position: 'bottom',
    color: '#ffffff',
    secondaryColor: '#cfe3ff',
    background: { type: 'color', value: '#00ff00' }
  }
]

export const DEFAULT_TEAMS: Team[] = [
  {
    id: 'team-worship',
    name: 'Worship',
    nameEs: 'Alabanza',
    positions: ['Leader / Líder', 'Vocals / Voces', 'Keys / Teclado', 'Guitar / Guitarra', 'Bass / Bajo', 'Drums / Batería']
  },
  {
    id: 'team-tech',
    name: 'Sound & Projection',
    nameEs: 'Sonido y Proyección',
    positions: ['Sound / Sonido', 'Projection / Proyección', 'Livestream / Transmisión']
  },
  { id: 'team-ushers', name: 'Ushers & Greeters', nameEs: 'Ujieres y Bienvenida', positions: ['Usher / Ujier', 'Greeter / Bienvenida'] },
  { id: 'team-kids', name: 'Kids & Nursery', nameEs: 'Niños y Guardería', positions: ['Teacher / Maestro(a)', 'Helper / Ayudante'] },
  { id: 'team-word', name: 'Pulpit', nameEs: 'Púlpito', positions: ['Preacher / Predicador', 'Reader / Lector', 'Prayer / Oración', 'Host / Anfitrión'] }
]

const now = Date.now()

export const SAMPLE_SONGS: Song[] = [
  {
    id: 'song-holy-holy-holy',
    title: 'Holy, Holy, Holy',
    titleEs: 'Santo, Santo, Santo',
    author: 'Reginald Heber (1826) / trad. Juan B. Cabrera',
    copyright: 'Public domain / Dominio público',
    tags: ['hymn', 'himno', 'trinity'],
    linesPerSlide: 4,
    key: 'D',
    arrangement: [],
    createdAt: now,
    updatedAt: now,
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verse 1',
        en: 'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy, merciful and mighty!\nGod in three Persons, blessed Trinity!',
        es: '¡Santo! ¡Santo! ¡Santo! Señor omnipotente,\nsiempre el labio mío loores te dará;\n¡Santo! ¡Santo! ¡Santo! te adoro reverente,\nDios en tres personas, bendita Trinidad.'
      },
      {
        id: 'v2',
        type: 'verse',
        label: 'Verse 2',
        en: 'Holy, holy, holy! All the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWho wert, and art, and evermore shalt be.',
        es: '¡Santo! ¡Santo! ¡Santo! en numeroso coro,\nsantos escogidos te adoran sin cesar,\nde alegría llenos, y sus coronas de oro\nrinden ante el trono y el cristalino mar.'
      },
      {
        id: 'v3',
        type: 'verse',
        label: 'Verse 3',
        en: 'Holy, holy, holy! Though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see;\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.',
        es: '¡Santo! ¡Santo! ¡Santo! la inmensa muchedumbre\nde ángeles que cumplen tu santa voluntad,\nante ti se postra bañada de tu lumbre,\nante ti que has sido, que eres y serás.'
      },
      {
        id: 'v4',
        type: 'verse',
        label: 'Verse 4',
        en: 'Holy, holy, holy! Lord God Almighty!\nAll Thy works shall praise Thy name, in earth, and sky, and sea;\nHoly, holy, holy; merciful and mighty!\nGod in three Persons, blessed Trinity!',
        es: '¡Santo! ¡Santo! ¡Santo! Señor omnipotente,\nsiempre el labio mío loores te dará;\n¡Santo! ¡Santo! ¡Santo! te adoro reverente,\nDios en tres personas, bendita Trinidad.'
      }
    ]
  },
  {
    id: 'song-mighty-fortress',
    title: 'A Mighty Fortress Is Our God',
    titleEs: 'Castillo Fuerte Es Nuestro Dios',
    author: 'Martin Luther (1529) / tr. F. H. Hedge; trad. Juan B. Cabrera',
    copyright: 'Public domain / Dominio público',
    tags: ['hymn', 'himno'],
    linesPerSlide: 3,
    key: 'C',
    arrangement: [],
    createdAt: now,
    updatedAt: now,
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verse 1',
        en: 'A mighty fortress is our God,\nA bulwark never failing;\nOur helper He amid the flood\nOf mortal ills prevailing:\nFor still our ancient foe\nDoth seek to work us woe;\nHis craft and power are great,\nAnd, armed with cruel hate,\nOn earth is not his equal.',
        es: 'Castillo fuerte es nuestro Dios,\ndefensa y buen escudo.\nCon su poder nos librará\nen este trance agudo.\nCon furia y con afán\nacósanos Satán:\npor armas deja ver\nastucia y gran poder;\ncual él no hay en la tierra.'
      },
      {
        id: 'v2',
        type: 'verse',
        label: 'Verse 2',
        en: "Did we in our own strength confide,\nOur striving would be losing;\nWere not the right Man on our side,\nThe Man of God's own choosing:\nDost ask who that may be?\nChrist Jesus, it is He;\nLord Sabaoth His name,\nFrom age to age the same,\nAnd He must win the battle.",
        es: 'Nuestro valor es nada aquí,\ncon él todo es perdido;\nmas por nosotros pugnará\nde Dios el escogido.\n¿Sabéis quién es? Jesús,\nel que venció en la cruz,\nSeñor de Sabaoth,\ny pues él solo es Dios,\nél triunfa en la batalla.'
      }
    ]
  },
  {
    id: 'song-doxology',
    title: 'Doxology',
    titleEs: 'Doxología',
    author: 'Thomas Ken (1674)',
    copyright: 'Public domain / Dominio público',
    tags: ['hymn', 'himno', 'offering', 'ofrenda'],
    linesPerSlide: 4,
    key: 'G',
    arrangement: [],
    createdAt: now,
    updatedAt: now,
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Doxology',
        en: 'Praise God, from whom all blessings flow;\nPraise Him, all creatures here below;\nPraise Him above, ye heavenly host;\nPraise Father, Son, and Holy Ghost. Amen.',
        es: 'A Dios el Padre celestial,\nal Hijo nuestro Redentor,\ny al eternal Consolador,\nunidos todos alabad. Amén.'
      }
    ]
  },
  {
    id: 'song-amazing-grace',
    title: 'Amazing Grace',
    author: 'John Newton (1779)',
    copyright: 'Public domain',
    tags: ['hymn', 'grace'],
    linesPerSlide: 2,
    key: 'G',
    arrangement: [],
    createdAt: now,
    updatedAt: now,
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verse 1',
        en: '[G]Amazing grace! How [C]sweet the [G]sound\nThat saved a wretch like [D]me!\nI [G]once was lost, but [C]now am [G]found;\nWas [Em]blind, but [D]now I [G]see.',
        es: ''
      },
      {
        id: 'v2',
        type: 'verse',
        label: 'Verse 2',
        en: "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.",
        es: ''
      },
      {
        id: 'v3',
        type: 'verse',
        label: 'Verse 3',
        en: "Through many dangers, toils and snares,\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.",
        es: ''
      },
      {
        id: 'v4',
        type: 'verse',
        label: 'Verse 4',
        en: "When we've been there ten thousand years,\nBright shining as the sun,\nWe've no less days to sing God's praise\nThan when we'd first begun.",
        es: ''
      }
    ]
  }
]

export function sampleTemplate(): ServicePlan {
  const t = Date.now()
  return {
    id: 'template-sunday',
    title: 'Sunday Service / Servicio Dominical',
    date: '',
    time: '11:00',
    serviceType: 'sunday',
    isTemplate: true,
    team: [],
    createdAt: t,
    updatedAt: t,
    items: [
      {
        id: 'i1',
        type: 'countdown',
        title: 'Countdown / Cuenta regresiva',
        durationMin: 5,
        countdown: { mode: 'time', time: '11:00', label: { en: 'Service begins in', es: 'El servicio comienza en' } }
      },
      {
        id: 'i2',
        type: 'header',
        title: 'Welcome / Bienvenida',
        durationMin: 3,
        slides: [{ title: { en: 'Welcome!', es: '¡Bienvenidos!' }, text: { en: 'We are glad you are here', es: 'Nos alegra que estés aquí' } }]
      },
      { id: 'i3', type: 'song', title: 'Holy, Holy, Holy', refId: 'song-holy-holy-holy', durationMin: 5 },
      { id: 'i4', type: 'song', title: 'A Mighty Fortress Is Our God', refId: 'song-mighty-fortress', durationMin: 5 },
      {
        id: 'i5',
        type: 'announcement',
        title: 'Announcements / Anuncios',
        durationMin: 5,
        loopSeconds: 0,
        slides: [
          { title: { en: 'Prayer Meeting', es: 'Reunión de Oración' }, text: { en: 'Wednesdays at 7:00 PM', es: 'Miércoles a las 7:00 PM' } },
          {
            title: { en: 'Food Pantry', es: 'Despensa de Alimentos' },
            text: { en: 'Saturdays 9–11 AM — volunteers welcome', es: 'Sábados 9–11 AM — se necesitan voluntarios' }
          }
        ]
      },
      { id: 'i6', type: 'song', title: 'Doxology', refId: 'song-doxology', durationMin: 2, notes: 'Offering / Ofrenda' },
      { id: 'i7', type: 'scripture', title: 'John 3:16-17', durationMin: 2, scripture: { ref: 'John 3:16-17', primary: 'rv1909', secondary: 'kjv' } },
      {
        id: 'i8',
        type: 'notes',
        title: 'Sermon / Prédica',
        durationMin: 35,
        slides: [
          {
            title: { en: 'God so loved', es: 'De tal manera amó Dios' },
            text: { en: "God's love is [[personal]] and [[sacrificial]]", es: 'El amor de Dios es [[personal]] y [[sacrificial]]' }
          }
        ]
      },
      { id: 'i9', type: 'blank', title: 'Closing prayer / Oración final', durationMin: 3 }
    ]
  }
}
