import path from 'path';

export const PORT = Number(process.env.PORT || 3000);
export const DATA_DIR = process.env.DATA_DIR || '/data';
export const DB_PATH = path.join(DATA_DIR, 'zan.sqlite');
export const IMAGE_CACHE_DIR = path.join(DATA_DIR, 'image-cache-v5');
export const SESSION_COOKIE = 'zan_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
export const YML_URL = process.env.YML_URL || 'https://milku.ru/site1/export-yandex-YML/';
export const PUSH_PUBLIC_KEY = process.env.PUSH_PUBLIC_KEY || '';
export const PUSH_PRIVATE_KEY = process.env.PUSH_PRIVATE_KEY || '';

export const FIXED_CATEGORIES = [
  { id: 54, name: 'Жидкие конфеты' },
  { id: 57, name: 'Карамель, леденцы, шипучки' },
  { id: 65, name: 'Шоколад' },
  { id: 81, name: 'Пирожные, бисквиты, печенье' },
  { id: 85, name: 'Мармелад, зефир, драже' },
  { id: 92, name: 'Жевательная резинка' },
  { id: 97, name: 'Жевательные конфеты' },
  { id: 101, name: 'ЛЕТО26' },
  { id: 105, name: 'Бакалея' }
];
