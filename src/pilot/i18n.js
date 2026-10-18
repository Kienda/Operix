import { en } from './locales/en.js';
import { fr } from './locales/fr.js';

const catalogs = { en, fr };
const KEY = 'operix.locale';
const listeners = new Set();

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && catalogs[saved]) return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
let language = initial();
document.documentElement.lang = language;

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];
export const getLanguage = () => language;
export const getLocale = () => (language === 'fr' ? 'fr-FR' : 'en-US');
export function setLanguage(code) {
  if (!catalogs[code]) return;
  language = code;
  document.documentElement.lang = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(code));
}
export function onLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** t('key', { name }) → catalog string with {placeholders}; falls back to English, then the key. */
export function t(key, params) {
  const template = catalogs[language][key] ?? en[key];
  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`Missing translation: ${key}`);
    return key;
  }
  return params ? template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? '')) : template;
}
