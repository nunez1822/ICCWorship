import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Background, Slide, Theme } from '@shared/types'
import { uid } from '@shared/slides'
import { useApp } from '../store'
import { Field, Seg, confirmDel } from '../../components/ui'
import { SlideView } from '../../components/SlideView'
import { toMediaUrl } from '../../lib/media'
import { themeBackground } from '../../lib/buildSlides'
import { updateLive } from '../liveControl'

const FONTS = [
  'Segoe UI',
  'Arial',
  'Calibri',
  'Cambria',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Times New Roman',
  'Garamond',
  'Bahnschrift',
  'Impact',
  'Candara',
  'Constantia',
  'Corbel'
]

const GRADIENTS = [
  'radial-gradient(ellipse at 50% 30%, #1d3557 0%, #0b1324 70%, #05080f 100%)',
  'linear-gradient(160deg, #3a1c71 0%, #d76d77 55%, #ffaf7b 100%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(160deg, #134e5e 0%, #71b280 100%)',
  'linear-gradient(135deg, #42275a 0%, #734b6d 100%)',
  'linear-gradient(180deg, #000000 0%, #3b2a14 100%)',
  'radial-gradient(circle at 30% 20%, #6a3093 0%, #1a0b2e 70%)',
  'linear-gradient(135deg, #8e0e00 0%, #1f1c18 100%)'
]

const SAMPLE: Slide = {
  id: 'sample',
  kind: 'text',
  text: {
    es: 'Porque de tal manera amó Dios al mundo,\nque ha dado a su Hijo unigénito',
    en: 'For God so loved the world,\nthat he gave his only begotten Son'
  },
  footer: { es: 'Juan 3:16 (RV1909)', en: 'John 3:16 (KJV)' }
}

/** the theme being edited survives leaving the page (so "Apply to screen now" means that theme) */
let lastThemeId: string | undefined

export function ThemesPage() {
  const { t } = useTranslation()
  const s = useApp()
  const [selId, setSelIdState] = useState(lastThemeId && s.themes.some((x) => x.id === lastThemeId) ? lastThemeId : s.settings.defaultThemeId)
  const setSelId = (id: string) => {
    lastThemeId = id
    setSelIdState(id)
  }
  const theme = s.themes.find((x) => x.id === selId) || s.themes[0]

  const duplicate = async (th: Theme) => {
    // "Name (copy)", then "Name (copy 2)", "Name (copy 3)"… so duplicates stay distinguishable
    const base = `${th.name} (${t('themes.copy')}`
    const taken = new Set(s.themes.map((x) => x.name))
    let name = `${base})`
    for (let n = 2; taken.has(name); n++) name = `${base} ${n})`
    const copy: Theme = { ...th, id: uid(), name, builtIn: false }
    await s.save('themes', copy)
    setSelId(copy.id)
  }

  return (
    <div className="split">
      <aside className="side">
        <div className="side-head">
          <b>🎨 {t('themes.title')}</b>
        </div>
        <div className="side-body">
          {s.themes.map((th) => (
            <div key={th.id} className={`list-item ${th.id === selId ? 'on' : ''}`} onClick={() => setSelId(th.id)} style={{ alignItems: 'center' }}>
              <div style={{ width: 96, flex: 'none' }} className="monitor-frame">
                <SlideView slide={SAMPLE} theme={th} displayLang="es" order="es-first" thumb />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="title">{th.name}</div>
                <div className="sub">
                  {th.id === s.settings.defaultThemeId && <span className="pill gold">{t('themes.default')}</span>} {th.builtIn && t('themes.builtIn')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <div className="content">
        {theme && <ThemeEditor key={theme.id} theme={theme} onDuplicate={duplicate} onDeleted={() => setSelId(s.settings.defaultThemeId)} />}
      </div>
    </div>
  )
}

function ThemeEditor({ theme, onDuplicate, onDeleted }: { theme: Theme; onDuplicate: (t: Theme) => void; onDeleted: () => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const ro = !!theme.builtIn
  const save = (patch: Partial<Theme>) => {
    if (ro) return
    const next = { ...theme, ...patch }
    void s.save('themes', next)
    // editing the theme that is on screen: show the change now, not at the next item
    const l = s.live
    if (l?.theme?.id === theme.id) {
      // compare with what the theme actually put on screen: the fallback gradient when its
      // image/video was removed from the library
      const bgFromTheme = l.background?.value === themeBackground(theme, s.media).value
      void updateLive(bgFromTheme ? { theme: next, background: themeBackground(next, s.media) } : { theme: next })
    }
  }
  const setBg = (patch: Partial<Background>) => save({ background: { ...theme.background, ...patch } })
  const [lang, setLang] = useState<'both' | 'es' | 'en'>('both')
  const visual = s.media.filter((m) => m.kind !== 'audio')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 24 }}>
      <div className="col">
        <div className="row">
          <input className="input big" style={{ flex: 1 }} value={theme.name} disabled={ro} onChange={(e) => save({ name: e.target.value })} />
        </div>
        {ro && (
          <div className="card row">
            <span style={{ flex: 1 }} className="small">
              🔒 {t('themes.builtInHelp')}
            </span>
            <button className="btn primary sm" onClick={() => onDuplicate(theme)}>
              ⧉ {t('themes.duplicate')}
            </button>
          </div>
        )}
        <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }} className="col">
          <div className="grid2">
            <Field label={t('themes.font')}>
              <select className="select" value={theme.fontFamily} onChange={(e) => save({ fontFamily: e.target.value })}>
                {[...new Set([theme.fontFamily, ...FONTS])].map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`${t('themes.size')} · ${theme.fontSize}px`}>
              <input type="range" min={36} max={130} value={theme.fontSize} onChange={(e) => save({ fontSize: +e.target.value })} />
            </Field>
            <Field label={t('themes.color')}>
              <input type="color" className="input" value={theme.color} onChange={(e) => save({ color: e.target.value })} />
            </Field>
            <Field label={t('themes.secondaryColor')}>
              <input type="color" className="input" value={theme.secondaryColor} onChange={(e) => save({ secondaryColor: e.target.value })} />
            </Field>
            <Field label={`${t('themes.secondaryScale')} · ${Math.round(theme.secondaryScale * 100)}%`}>
              <input type="range" min={0.5} max={1} step={0.02} value={theme.secondaryScale} onChange={(e) => save({ secondaryScale: +e.target.value })} />
            </Field>
            <div className="row wrap" style={{ alignSelf: 'end' }}>
              {(['bold', 'shadow', 'outline', 'uppercase'] as const).map((k) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={theme[k]} onChange={(e) => save({ [k]: e.target.checked })} /> {t(`themes.${k}`)}
                </label>
              ))}
            </div>
          </div>
          <div className="row wrap">
            <Field label={t('themes.align')}>
              <Seg
                value={theme.align}
                onChange={(v) => save({ align: v })}
                options={[
                  { value: 'left', label: '⟸' },
                  { value: 'center', label: '☰' },
                  { value: 'right', label: '⟹' }
                ]}
              />
            </Field>
            <Field label={t('themes.position')}>
              <Seg
                value={theme.position}
                onChange={(v) => save({ position: v })}
                options={[
                  { value: 'top', label: t('themes.top') },
                  { value: 'middle', label: t('themes.middle') },
                  { value: 'bottom', label: t('themes.bottom') }
                ]}
              />
            </Field>
          </div>
          <div className="section-title">{t('themes.background')}</div>
          <Seg
            value={theme.background.type}
            onChange={(v) =>
              setBg({
                type: v,
                value:
                  v === 'color'
                    ? '#000000'
                    : v === 'gradient'
                      ? GRADIENTS[0]
                      : visual.find((m) => m.kind === v)?.path
                        ? toMediaUrl(visual.find((m) => m.kind === v)!.path)
                        : ''
              })
            }
            options={[
              { value: 'color', label: t('themes.bg.color') },
              { value: 'gradient', label: t('themes.bg.gradient') },
              { value: 'image', label: t('themes.bg.image') },
              { value: 'video', label: t('themes.bg.video') }
            ]}
          />
          {theme.background.type === 'color' && (
            <input type="color" className="input" style={{ width: 120 }} value={theme.background.value} onChange={(e) => setBg({ value: e.target.value })} />
          )}
          {theme.background.type === 'gradient' && (
            <div className="row wrap">
              {GRADIENTS.map((g) => (
                <div
                  key={g}
                  onClick={() => !ro && setBg({ value: g })}
                  style={{
                    width: 70,
                    height: 40,
                    borderRadius: 8,
                    background: g,
                    cursor: 'pointer',
                    border: theme.background.value === g ? '2px solid var(--accent)' : '2px solid var(--border)'
                  }}
                />
              ))}
            </div>
          )}
          {(theme.background.type === 'image' || theme.background.type === 'video') && (
            <>
              <select className="select" value={theme.background.value} onChange={(e) => setBg({ value: e.target.value })}>
                <option value="">—</option>
                {visual
                  .filter((m) => m.kind === theme.background.type)
                  .map((m) => (
                    <option key={m.id} value={toMediaUrl(m.path)}>
                      {m.name}
                    </option>
                  ))}
              </select>
              {!visual.some((m) => m.kind === theme.background.type) && <div className="small muted">{t('themes.addMediaFirst')}</div>}
            </>
          )}
          <Field label={`${t('themes.dim')} · ${Math.round((theme.background.dim || 0) * 100)}%`}>
            <input type="range" min={0} max={0.9} step={0.05} value={theme.background.dim || 0} onChange={(e) => setBg({ dim: +e.target.value })} />
          </Field>
        </fieldset>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={s.settings.defaultThemeId === theme.id} onClick={() => void s.setSettings({ defaultThemeId: theme.id })}>
            ⭐ {t('themes.makeDefault')}
          </button>
          {!ro && (
            <button className="btn" onClick={() => onDuplicate(theme)}>
              ⧉ {t('themes.duplicate')}
            </button>
          )}
          <button className="btn" onClick={() => void updateLive({ theme, background: themeBackground(theme, s.media) })}>
            📺 {t('themes.applyLive')}
          </button>
          {!ro && (
            <button
              className="btn ghost"
              onClick={async () => {
                if (!confirmDel(t('themes.confirmDelete'))) return
                if (s.settings.defaultThemeId === theme.id) await s.setSettings({ defaultThemeId: 'theme-classic' })
                await s.remove('themes', theme.id)
                onDeleted()
              }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      <div className="col">
        <div className="row">
          <div className="section-title" style={{ flex: 1 }}>
            {t('item.preview')}
          </div>
          <Seg
            value={lang}
            onChange={setLang}
            options={[
              { value: 'es', label: 'ES' },
              { value: 'en', label: 'EN' },
              { value: 'both', label: 'ES + EN' }
            ]}
          />
        </div>
        <div className="monitor-frame">
          <SlideView slide={SAMPLE} theme={theme} displayLang={lang} order={s.settings.bilingualOrder} />
        </div>
        <div className="small muted">💡 {t('themes.lowerThirdHelp')}</div>
      </div>
    </div>
  )
}
