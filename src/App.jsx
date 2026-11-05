import { lazy, Suspense, useEffect, useState } from 'react'
import logo from './assets/logo.jpg'
import { Icon } from './icons.jsx'
import { CONTACT, SOCIALS, T } from './content.js'
import './App.css'

const Hero3D = lazy(() => import('./Hero3D.jsx'))

const SECTIONS = ['services', 'courses', 'why', 'contact']

/* Fade/slide sections in as they scroll into view */
function useReveal(dep) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.15 },
    )
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [dep])
}

/* Card tilts toward the cursor in 3D */
function tilt(e) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5
  const y = (e.clientY - r.top) / r.height - 0.5
  el.style.setProperty('--ry', `${x * 14}deg`)
  el.style.setProperty('--rx', `${-y * 14}deg`)
  el.style.setProperty('--gx', `${(x + 0.5) * 100}%`)
  el.style.setProperty('--gy', `${(y + 0.5) * 100}%`)
}
function untilt(e) {
  e.currentTarget.style.setProperty('--rx', '0deg')
  e.currentTarget.style.setProperty('--ry', '0deg')
}

/* 3D staircase — one step per course level */
function Stairs({ levels, active, onPick, hint }) {
  const [rot, setRot] = useState(0)
  return (
    <div
      className="stairs-scene reveal"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setRot(((e.clientX - r.left) / r.width - 0.5) * 16)
      }}
      onPointerLeave={() => setRot(0)}
    >
      <div className="stairs" style={{ '--rz': `${-38 + rot}deg` }}>
        {levels.map((lv, i) => (
          <button
            key={i}
            type="button"
            className={`step ${active === i ? 'on' : ''}`}
            style={{ '--i': i }}
            onClick={() => onPick(i)}
            aria-label={`${lv.label}: ${lv.title}`}
            title={`${lv.label}: ${lv.title}`}
          >
            <span className="face top">{i + 1}</span>
            <span className="face front"></span>
            <span className="face side"></span>
          </button>
        ))}
      </div>
      <p className="stairs-hint">{hint}</p>
    </div>
  )
}

/* Highlights the nav link of the section currently in view */
function useScrollSpy(ids) {
  const [active, setActive] = useState('')
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => e.isIntersecting && setActive(e.target.id))
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [ids])
  return active
}

function SectionHead({ title, text }) {
  return (
    <div className="section-head reveal">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  )
}

function Level({ level, t, open, onToggle, index }) {
  return (
    <details className={`level reveal ${open ? 'is-open' : ''}`} open={open} id={`level-${index}`}>
      <summary
        onClick={(e) => {
          e.preventDefault()
          onToggle()
        }}
      >
        <span className="level-label">{level.label}</span>
        <span className="level-title">{level.title}</span>
        <span className="level-time">
          <Icon name="clock" size={15} />
          {level.duration}
        </span>
        <Icon name="chevron" size={20} className="level-chevron" />
      </summary>

      <div className="level-body">
        {level.note && <p className="level-note">{level.note}</p>}

        {level.topics && (
          <ul className="topics">
            {level.topics.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}

        {level.parts && (
          <ol className="parts">
            {level.parts.map((part, i) => (
              <li key={part.title}>
                <h4>
                  <span>{t.partLabel(i + 1)}:</span>{' '}
                  {part.title}
                  <em>{part.time}</em>
                </h4>
                <ul className="topics">
                  {part.items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}

        {level.final && (
          <p className="final">
            <Icon name="flag" size={17} />
            <span>
              <strong>{t.finalLabel}:</strong> {level.final}
            </span>
          </p>
        )}
      </div>
    </details>
  )
}

function SocialItem({ s, t }) {
  const [copied, setCopied] = useState(false)
  const inner = (
    <>
      <span className="social-icon">
        <Icon name={s.id} size={20} />
      </span>
      <span className="social-name">{s.name}</span>
      <span className="social-handle">{copied ? t.copied : s.handle}</span>
      <Icon name={s.url ? 'external' : copied ? 'check' : 'copy'} size={15} className="social-go" />
    </>
  )
  if (s.url) {
    return (
      <a className={`social-item social-${s.id}`} href={s.url} target="_blank" rel="noreferrer">
        {inner}
      </a>
    )
  }
  return (
    <button
      type="button"
      className={`social-item social-${s.id}`}
      title={t.copy}
      onClick={() => {
        navigator.clipboard?.writeText(s.handle)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
    >
      {inner}
    </button>
  )
}

function App() {
  const [lang, setLang] = useState('tk')
  const [open, setOpen] = useState(false)
  const [openLevel, setOpenLevel] = useState(0)
  const t = T[lang]
  const active = useScrollSpy(SECTIONS)
  useReveal(lang)

  const pickLevel = (i) => {
    setOpenLevel(i)
    requestAnimationFrame(() =>
      document.getElementById(`level-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    )
  }

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  /* Mobile menu: Esc closes it, and the page behind doesn't scroll */
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div className="app">
      {/* ---------------- Header ---------------- */}
      <header className="header">
        <div className="container header-inner">
          <a href="#top" className="brand" onClick={close}>
            <img src={logo} alt="" className="brand-logo" width="40" height="40" />
            <span className="brand-text">
              <strong>MegaByte</strong>
              <small>Academy & IT-Club</small>
            </span>
          </a>

          <nav className={`nav ${open ? 'open' : ''}`} id="site-nav">
            {SECTIONS.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={close}
                className={active === id ? 'active' : ''}
                aria-current={active === id ? 'true' : undefined}
              >
                {t.nav[id]}
              </a>
            ))}
            <a href={`tel:${CONTACT.phoneRaw[0]}`} className="btn btn-primary mobile-only" onClick={close}>
              <Icon name="phone" size={18} />
              {CONTACT.phones[0]}
            </a>
          </nav>

          <div className="header-actions">
            <div className="lang" role="group" aria-label="Language">
              {[
                ['tk', 'TM'],
                ['en', 'EN'],
              ].map(([code, label]) => (
                <button
                  key={code}
                  className={lang === code ? 'active' : ''}
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                >
                  {label}
                </button>
              ))}
            </div>
            <a href={`tel:${CONTACT.phoneRaw[0]}`} className="header-phone desktop-only">
              <Icon name="phone" size={17} />
              {CONTACT.phones[0]}
            </a>
            <button
              className={`burger ${open ? 'open' : ''}`}
              aria-label={t.menu}
              aria-expanded={open}
              aria-controls="site-nav"
              onClick={() => setOpen((v) => !v)}
            >
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>
      <div className={`nav-backdrop ${open ? 'show' : ''}`} onClick={close} aria-hidden="true"></div>

      <main id="top">
        {/* ---------------- Hero ---------------- */}
        <section className="hero">
          <div className="container hero-inner">
            <div className="hero-copy">
              <p className="kicker">
                <img src={logo} alt="" width="28" height="28" />
                {t.heroKicker}
              </p>
              <h1>{t.heroTitle}</h1>
              <p className="hero-text">{t.heroText}</p>
              <div className="hero-btns">
                <a href={`tel:${CONTACT.phoneRaw[0]}`} className="btn btn-primary">
                  <Icon name="phone" size={18} />
                  {t.heroCall}
                </a>
                <a href="#courses" className="btn btn-outline">
                  {t.heroCourses}
                </a>
              </div>
              <p className="hero-phones">
                {CONTACT.phones.map((p, i) => (
                  <a key={p} href={`tel:${CONTACT.phoneRaw[i]}`}>{p}</a>
                ))}
              </p>
            </div>

            <div className="hero-visual">
              <Suspense fallback={null}>
                <Hero3D />
              </Suspense>
              <span className="hero-3d-hint">
                <Icon name="sparkle" size={14} /> {t.hint3d}
              </span>
            </div>
          </div>

          <div className="container">
            <ul className="hero-strip">
              {t.board.map(([icon, name, sub], i) => (
                <li key={icon} className="reveal" style={{ '--d': `${i * 70}ms` }}>
                  <span className="strip-icon">
                    <Icon name={icon} size={20} />
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>{sub}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- Services ---------------- */}
        <section id="services" className="section">
          <div className="container">
            <SectionHead title={t.servicesTitle} text={t.servicesText} />
            <div className="services">
              {t.services.map(([icon, title, desc], i) => (
                <article
                  className="service reveal"
                  key={icon}
                  style={{ '--d': `${(i % 4) * 70}ms` }}
                  onPointerMove={tilt}
                  onPointerLeave={untilt}
                >
                  <span className="service-icon">
                    <Icon name={icon} size={22} />
                  </span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Courses ---------------- */}
        <section id="courses" className="section section-tint">
          <div className="container">
            <div className="courses-head">
              <SectionHead title={t.coursesTitle} text={t.coursesText} />
              <Stairs levels={t.levels} active={openLevel} onPick={pickLevel} hint={t.stairsHint} />
            </div>

            <div className="courses">
              <aside className="courses-aside">
                <div className="panel reveal">
                  <h3>{t.stepsTitle}</h3>
                  <ol className="steps">
                    {t.steps.map(([title, text]) => (
                      <li key={title}>
                        <strong>{title}</strong>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ol>
                  <a href={`tel:${CONTACT.phoneRaw[0]}`} className="btn btn-primary btn-block">
                    <Icon name="phone" size={18} />
                    {t.enroll}
                  </a>
                </div>

                <div className="panel reveal">
                  <h3>{t.shortTitle}</h3>
                  <p className="panel-sub">
                    <Icon name="clock" size={15} />
                    {t.shortDuration}
                  </p>
                  <ul className="short">
                    {t.short.map(([icon, title, desc]) => (
                      <li key={icon}>
                        <Icon name={icon} size={20} />
                        <span>
                          <strong>{title}</strong>
                          <small>{desc}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>

              <div className="levels">
                {t.levels.map((level, i) => (
                  <Level
                    key={i}
                    index={i}
                    level={level}
                    t={t}
                    open={openLevel === i}
                    onToggle={() => setOpenLevel(openLevel === i ? -1 : i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Why us ---------------- */}
        <section id="why" className="section section-dark">
          <div className="container">
            <SectionHead title={t.whyTitle} />
            <div className="why">
              {t.why.map(([icon, title, desc], i) => (
                <div className="why-item reveal" key={icon} style={{ '--d': `${(i % 3) * 80}ms` }}>
                  <Icon name={icon} size={22} />
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Contact ---------------- */}
        <section id="contact" className="section">
          <div className="container">
            <SectionHead title={t.contactTitle} text={t.contactText} />

            <div className="contact">
              <div className="contact-list reveal">
                <div className="contact-row">
                  <span className="contact-label">
                    <Icon name="phone" size={18} /> {t.callNow}
                  </span>
                  <div>
                    {CONTACT.phones.map((p, i) => (
                      <a key={p} href={`tel:${CONTACT.phoneRaw[i]}`} className="contact-big">{p}</a>
                    ))}
                  </div>
                </div>
                <div className="contact-row">
                  <span className="contact-label">
                    <Icon name="mail" size={18} /> {t.writeUs}
                  </span>
                  <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                </div>
                <div className="contact-row">
                  <span className="contact-label">
                    <Icon name="globe" size={18} /> {t.visitWeb}
                  </span>
                  <div>
                    <a href={CONTACT.web} target="_blank" rel="noreferrer">mega-byte.tilda.ws</a>
                    <a href={CONTACT.webPro} target="_blank" rel="noreferrer">mega-byte-pro.base44.app</a>
                  </div>
                </div>
              </div>

              <div className="social reveal">
                <h3>{t.socialTitle}</h3>
                <div className="social-list">
                  {SOCIALS.map((s) => (
                    <SocialItem key={s.id} s={s} t={t} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <img src={logo} alt="" className="brand-logo" width="40" height="40" />
            <div>
              <strong>MegaByte</strong>
              <span>{t.footerTagline}</span>
            </div>
          </div>
          <nav className="footer-nav" aria-label="Footer">
            {SECTIONS.map((id) => (
              <a key={id} href={`#${id}`}>{t.nav[id]}</a>
            ))}
          </nav>
          <div className="footer-social">
            {SOCIALS.filter((s) => s.url).map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noreferrer" aria-label={s.name} title={s.handle}>
                <Icon name={s.id} size={18} />
              </a>
            ))}
          </div>
        </div>
        <div className="container footer-bottom">
          © {new Date().getFullYear()} MegaByte Academy & IT-Club. {t.rights}
        </div>
      </footer>
    </div>
  )
}

export default App
