import { Icon } from './icons.jsx'

const LANGUAGES = [
  ['tk', 'TM'],
  ['ru', 'RU'],
  ['en', 'EN'],
]

export function SiteControls({ lang, onLanguageChange, theme, onThemeToggle, t }) {
  return (
    <div className="site-controls">
      <div className="lang" role="group" aria-label={t.controls.language}>
        {LANGUAGES.map(([code, label]) => (
          <button
            key={code}
            className={lang === code ? 'active' : ''}
            onClick={() => onLanguageChange(code)}
            aria-label={t.controls.languages[code]}
            aria-pressed={lang === code}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="theme-toggle"
        onClick={onThemeToggle}
        aria-label={theme === 'dark' ? t.controls.switchToLight : t.controls.switchToDark}
        title={theme === 'dark' ? t.controls.switchToLight : t.controls.switchToDark}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </button>
    </div>
  )
}
