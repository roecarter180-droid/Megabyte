import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import logo from './assets/logo.jpg'
import { Icon } from './icons.jsx'
import { CONTACT, SOCIALS, T } from './content.js'
import { AdminDashboard, OrderTrackingPage, ServiceCard, ServiceOrderModal } from './OrderSystem.jsx'
import { SiteControls } from './SiteControls.jsx'
import './App.css'

const Hero3D = lazy(() => import('./Hero3D.jsx'))

const SECTIONS = ['services', 'courses', 'why', 'contact']
const SERVICE_VIDEOS = ['logo', 'network', 'repair', 'gaming-setup', 'camera']

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
    <details className={`level ${open ? 'is-open' : ''}`} open={open} id={`level-${index}`}>
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

function ServiceDemoVideo({ video, label }) {
  const videoRef = useRef(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = videoRef.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsNearViewport(true)
      setIsVisible(entry.isIntersecting)
    }, { rootMargin: '100px' })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = videoRef.current
    if (!element || !isVisible || !isNearViewport) return

    element.play().catch((error) => {
      if (!['NotAllowedError', 'AbortError'].includes(error.name)) {
        console.error('Could not start service demo video:', error)
      }
    })
  }, [isNearViewport, isVisible])

  useEffect(() => {
    if (!isVisible) videoRef.current?.pause()
  }, [isVisible])

  return (
    <video
      ref={videoRef}
      className="service-demo-video"
      {...(isNearViewport ? { src: `/videos/${video}.mp4` } : {})}
      poster={`/videos/${video}.jpg`}
      autoPlay={isNearViewport}
      controls
      loop
      muted
      playsInline
      preload="none"
      aria-label={label}
    />
  )
}

function MainSite({ lang, setLang, theme, onThemeToggle }) {
  const [open, setOpen] = useState(false)
  const [openLevel, setOpenLevel] = useState(0)
  const [levelScrollRequest, setLevelScrollRequest] = useState(null)
  const [orderService, setOrderService] = useState('')
  const t = T[lang]
  const active = useScrollSpy(SECTIONS)
  useReveal(lang)

  useEffect(() => {
    if (levelScrollRequest === null) return
    document
      .getElementById(`level-${levelScrollRequest.index}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [levelScrollRequest])

  const pickLevel = (i) => {
    setOpenLevel(i)
    setLevelScrollRequest({ index: i })
  }

  const toggleLevel = (i) => {
    if (openLevel === i) {
      setOpenLevel(-1)
      return
    }
    setOpenLevel(i)
    setLevelScrollRequest({ index: i })
  }

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
            <SiteControls
              lang={lang}
              onLanguageChange={setLang}
              theme={theme}
              onThemeToggle={onThemeToggle}
              t={t}
            />
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

          <div className="container hero-work">
            <h2 className="hero-work-title reveal">{t.boardTitle}</h2>
            <ul className="hero-strip">
              {t.board.map(([icon, name, sub, steps], i) => (
                <li key={icon} className="reveal" style={{ '--d': `${i * 70}ms` }}>
                  <div className="process-card-head">
                    <span className="strip-icon">
                      <Icon name={icon} size={22} />
                    </span>
                    <span className="process-card-title">
                      <strong>{name}</strong>
                      <small>{sub}</small>
                    </span>
                  </div>
                  <ol className="process-steps">
                    {steps.map((step, stepIndex) => (
                      <li key={step}>
                        <span className="process-step-number">{stepIndex + 1}</span>
                        <span className="process-step-label">{step}</span>
                        {stepIndex < steps.length - 1 && <Icon name="arrowRight" size={15} className="process-arrow" />}
                      </li>
                    ))}
                  </ol>
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
              {t.services.map(([icon, title, desc, serviceId]) => (
                <ServiceCard
                  key={serviceId}
                  icon={icon}
                  title={title}
                  description={desc}
                  t={t}
                  onOrder={() => setOrderService(serviceId)}
                />
              ))}
            </div>
            <div className="service-demo reveal">
              <div className="service-demo-copy">
                <span className="service-demo-icon">
                  <Icon name="globe" size={22} />
                </span>
                <h3>{t.servicesDemoTitle}</h3>
                <p>{t.servicesDemoText}</p>
              </div>
              <div className="service-demo-marquee">
                <div className="service-demo-track">
                  <div className="service-demo-video-group">
                    {SERVICE_VIDEOS.map((video, i) => (
                      <figure className="service-demo-video-card" key={video}>
                        <ServiceDemoVideo video={video} label={t.servicesDemoVideos[i]} />
                        <figcaption>{t.servicesDemoVideos[i]}</figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="service-demo-video-group" aria-hidden="true">
                    {SERVICE_VIDEOS.map((video, i) => (
                      <figure className="service-demo-video-card" key={video}>
                        <img
                          className="service-demo-video"
                          src={`/videos/${video}.jpg`}
                          alt=""
                          loading="lazy"
                        />
                        <figcaption>{t.servicesDemoVideos[i]}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              </div>
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
                    onToggle={() => toggleLevel(i)}
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
      {orderService && (
        <ServiceOrderModal
          t={t}
          initialServiceId={orderService}
          onClose={() => setOrderService('')}
        />
      )}
    </div>
  )
}

function App() {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('megabyte-language')
    return ['tk', 'ru', 'en'].includes(saved) ? saved : 'tk'
  })
  const [theme, setTheme] = useState(() => localStorage.getItem('megabyte-theme') === 'dark' ? 'dark' : 'light')
  const t = T[lang]
  const path = window.location.pathname

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dataset.theme = theme
    localStorage.setItem('megabyte-language', lang)
    localStorage.setItem('megabyte-theme', theme)
  }, [lang, theme])

  const onThemeToggle = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')

  if (path.startsWith('/track/')) {
    return (
      <OrderTrackingPage
        token={path.split('/')[2] ?? ''}
        t={t}
        lang={lang}
        setLang={setLang}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
    )
  }
  if (path === '/admin' || path === '/admin/') {
    return (
      <AdminDashboard
        t={t}
        lang={lang}
        setLang={setLang}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
    )
  }
  return <MainSite lang={lang} setLang={setLang} theme={theme} onThemeToggle={onThemeToggle} />
}

export default App
