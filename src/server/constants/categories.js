export const FIXED_CATEGORIES = [
  { id: 54, name: 'Жидкие конфеты', sortOrder: 1 },
  { id: 57, name: 'Карамель, леденцы, шипучки', sortOrder: 2 },
  { id: 65, name: 'Шоколад', sortOrder: 3 },
  { id: 81, name: 'Пирожные, бисквиты, печенье', sortOrder: 4 },
  { id: 85, name: 'Мармелад, зефир, драже', sortOrder: 5 },
  { id: 92, name: 'Жевательная резинка', sortOrder: 6 },
  { id: 97, name: 'Жевательные конфеты', sortOrder: 7 },
  { id: 101, name: 'ЛЕТО26', sortOrder: 8 },
  { id: 105, name: 'Бакалея', sortOrder: 9 },
];

export const FIXED_CATEGORY_IDS = new Set(FIXED_CATEGORIES.map((item) => Number(item.id)));
