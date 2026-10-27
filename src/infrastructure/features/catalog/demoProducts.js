const image = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
export const demoProducers = [
  {
    id: 'producer-1',
    name: 'Grădina familiei Rusu',
    locality: 'Ialoveni',
    description:
      'Legume crescute cu grijă, în grădina familiei noastre. Din pământ bun, direct pe masa ta.',
  },
  {
    id: 'producer-2',
    name: 'Stupina lui Vasile',
    locality: 'Orhei',
    description: 'Miere de la stupii noștri, din inima codrilor Moldovei.',
  },
  {
    id: 'producer-3',
    name: 'Ferma de pe deal',
    locality: 'Strășeni',
    description:
      'O fermă mică, cu multă grijă pentru animale și produse proaspete.',
  },
];
export const demoProducts = [
  {
    id: 'product-1',
    producerId: 'producer-1',
    title: 'Roșii de grădină',
    category: 'legume',
    unit: 'kg',
    priceAmount: '35.00',
    currency: 'MDL',
    availableQuantity: 30,
    imageUrl: image('photo-1546094096-0df4bcaaa337'),
    badge: 'De sezon',
    description:
      'Roșii coapte la soare, aromate și culese cu grijă. Perfecte pentru o salată simplă de vară.',
  },
  {
    id: 'product-2',
    producerId: 'producer-2',
    title: 'Miere de salcâm',
    category: 'miere',
    unit: 'buc',
    priceAmount: '140.00',
    currency: 'MDL',
    availableQuantity: 20,
    imageUrl: image('photo-1587049352851-8d4e89133924'),
    badge: 'Preferatul comunității',
    description:
      'Miere de salcâm, cu gust delicat și aromă florală. Borcan de 500 g.',
  },
  {
    id: 'product-3',
    producerId: 'producer-3',
    title: 'Ouă de țară',
    category: 'oua',
    unit: 'buc',
    priceAmount: '45.00',
    currency: 'MDL',
    availableQuantity: 25,
    imageUrl: image('photo-1518569656558-1f25e69d93d7'),
    badge: 'Proaspăt',
    description: 'O cutie cu 10 ouă de la găini crescute în aer liber.',
  },
  {
    id: 'product-4',
    producerId: 'producer-1',
    title: 'Mere din livadă',
    category: 'fructe',
    unit: 'kg',
    priceAmount: '22.00',
    currency: 'MDL',
    availableQuantity: 50,
    imageUrl: image('photo-1560806887-1e4cd0b6cbd6'),
    badge: 'De sezon',
    description:
      'Mere crocante din livada familiei, culese manual și pline de gust.',
  },
  {
    id: 'product-5',
    producerId: 'producer-3',
    title: 'Brânză proaspătă',
    category: 'lactate',
    unit: 'kg',
    priceAmount: '95.00',
    currency: 'MDL',
    availableQuantity: 12,
    imageUrl: image('photo-1486297678162-eb2a19b0a32d'),
    badge: 'Artizanal',
    description:
      'Brânză proaspătă de vaci, pregătită în loturi mici la ferma noastră.',
  },
  {
    id: 'product-6',
    producerId: 'producer-1',
    title: 'Morcovi dulci',
    category: 'legume',
    unit: 'kg',
    priceAmount: '18.00',
    currency: 'MDL',
    availableQuantity: 35,
    imageUrl: image('photo-1445282768818-728615cc910a'),
    badge: 'Din grădină',
    description:
      'Morcovi proaspeți și crocanți, buni în supe, salate sau ca gustare.',
  },
];
