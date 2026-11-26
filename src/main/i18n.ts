/**
 * Translations for text the main process shows itself (menus, dialogs). Same files as the renderer
 * (src/renderer/i18n/en.json, es.json), so tests/i18n.test.ts checks these keys too: always call t() with a
 * literal key, e.g. t('menu.help').
 */
import en from '../renderer/i18n/en.json'
import es from '../renderer/i18n/es.json'
import type { Lang } from '@shared/types'

type Tree = { [k: string]: string | Tree }
const FILES: Record<Lang, Tree> = { en: en as Tree, es: es as Tree }

let lang: Lang = 'es'
export function setMainLang(l: Lang): void {
  lang = l
}

function lookup(tree: Tree, key: string): string | undefined {
  let cur: string | Tree | undefined = tree
  for (const part of key.split('.')) cur = typeof cur === 'object' ? cur[part] : undefined
  return typeof cur === 'string' ? cur : undefined
}

/** i18next-style: {{var}} interpolation and key_one / key_other plurals when vars.count is given. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const tree = FILES[lang]
  const plural = typeof vars.count === 'number' ? (vars.count === 1 ? `${key}_one` : `${key}_other`) : undefined
  const raw = (plural && (lookup(tree, plural) ?? lookup(FILES.en, plural))) ?? lookup(tree, key) ?? lookup(FILES.en, key) ?? key
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, v: string) => (v in vars ? String(vars[v]) : ''))
}
