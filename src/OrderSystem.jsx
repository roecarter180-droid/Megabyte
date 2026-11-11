import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { ORDER_STATUSES } from '../shared/serviceCatalog.js'
import logo from './assets/logo.jpg'
import { Icon } from './icons.jsx'
import { SiteControls } from './SiteControls.jsx'
import './OrderSystem.css'

const WORKFLOW_STATUS = ORDER_STATUSES.filter((status) => status !== 'cancelled')
const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 5
const hostedSupabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  : null

async function request(url, options) {
  const response = await fetch(url, options)
  if (response.status === 204) return null
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('SERVICE_API_UNAVAILABLE')
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('SERVICE_API_UNAVAILABLE')
  }
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.')
    error.status = response.status
    throw error
  }
  return data
}

function formatDate(value, lang, options = {}) {
  if (!value) return ''
  const locale = lang === 'tk' ? 'tk-TM' : lang === 'ru' ? 'ru-RU' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...options,
  }).format(new Date(value))
}

function RouteHeader({ title, back, lang, setLang, theme, onThemeToggle, t }) {
  return (
    <header className="portal-header">
      <a className="portal-brand" href="/">
        <img src={logo} alt="" width="40" height="40" />
        <span>MegaByte</span>
      </a>
      <a className="portal-back" href={back}>
        {t.order.adminHome}
      </a>
      <SiteControls
        lang={lang}
        onLanguageChange={setLang}
        theme={theme}
        onThemeToggle={onThemeToggle}
        t={t}
      />
      <h1>{title}</h1>
    </header>
  )
}

export function ServiceCard({ icon, title, description, style }) {
  return (
    <article
      className="service reveal"
      style={style}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - rect.left) / rect.width - 0.5
        const y = (event.clientY - rect.top) / rect.height - 0.5
        event.currentTarget.style.setProperty('--ry', `${x * 6}deg`)
        event.currentTarget.style.setProperty('--rx', `${-y * 6}deg`)
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty('--rx', '0deg')
        event.currentTarget.style.setProperty('--ry', '0deg')
      }}
    >
      <div className="service-content">
        <span className="service-icon">
          <Icon name={icon} size={22} />
        </span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  )
}

export function ServiceOrderModal({ t, initialServiceId, onClose }) {
  const [step, setStep] = useState(0)
  const [serviceId, setServiceId] = useState(initialServiceId)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdOrder, setCreatedOrder] = useState(null)
  const order = t.order
  const serviceIndex = t.services.findIndex((service) => serviceId === service[3])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, submitting])

  const checkStep = () => {
    if (step === 0 && !serviceId) return order.required
    if (step === 1) {
      if (name.trim().length < 2) return order.required
      if (phone.replace(/\D/g, '').length < 7) return order.invalidPhone
    }
    if (step === 2 && description.trim().length < 5) return order.invalidDescription
    if (
      step === 3 &&
      (photos.length > MAX_FILES ||
        photos.some(
          (photo) =>
            !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) ||
            photo.size > MAX_FILE_SIZE,
        ))
    ) return order.photoError
    return ''
  }

  const next = () => {
    const validationError = checkStep()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setStep((current) => Math.min(current + 1, 4))
  }

  const submit = async (event) => {
    event.preventDefault()
    const validationError = checkStep()
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError('')
    let uploadIds = []
    try {
      if (hostedSupabase) {
        const { uploads } = photos.length
          ? await request('/api/uploads/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photos: photos.map((photo) => ({ name: photo.name, size: photo.size, type: photo.type })),
            }),
          })
          : { uploads: [] }
        const results = await Promise.allSettled(uploads.map(async (upload, index) => {
          const { error: uploadError } = await hostedSupabase.storage
            .from('order-photos')
            .uploadToSignedUrl(upload.storageName, upload.token, photos[index], {
              contentType: photos[index].type,
              upsert: false,
            })
          if (uploadError) throw uploadError
          return upload.id
        }))
        uploadIds = results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value)
        const failedUpload = results.find((result) => result.status === 'rejected')
        if (failedUpload) throw failedUpload.reason
        setCreatedOrder(await request('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceId,
            name: name.trim(),
            phone: phone.trim(),
            description: description.trim(),
            uploadIds,
          }),
        }))
      } else {
        const body = new FormData()
        body.append('serviceId', serviceId)
        body.append('name', name.trim())
        body.append('phone', phone.trim())
        body.append('description', description.trim())
        photos.forEach((photo) => body.append('photos', photo))
        setCreatedOrder(await request('/api/orders', { method: 'POST', body }))
      }
    } catch (requestError) {
      if (uploadIds.length) {
        try {
          await request('/api/uploads/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: uploadIds }),
          })
        } catch (cleanupError) {
          console.error('Could not clean up uploaded order photos:', cleanupError)
        }
      }
      setError(
        requestError.message === 'SERVICE_API_UNAVAILABLE'
          ? order.apiUnavailable
          : requestError.message || order.orderError,
      )
    } finally {
      setSubmitting(false)
    }
  }

  const closeFromBackdrop = (event) => {
    if (event.target === event.currentTarget && !submitting) onClose()
  }

  return (
    <div className="order-overlay" onMouseDown={closeFromBackdrop}>
      <section className="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-title">
        <button type="button" className="portal-close" aria-label={order.close} disabled={submitting} onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        <span className="portal-kicker">{order.formTitle}</span>
        <h2 id="order-title">{createdOrder ? order.orderCreated : order.stepTitles[step]}</h2>
        {!createdOrder ? (
          <>
            <div className="order-progress" aria-label={`${step + 1} / 5`}>
              {order.stepTitles.map((label, index) => (
                <div className={`order-progress-step ${index <= step ? 'is-current' : ''}`} key={label}>
                  <span>{index < step ? <Icon name="check" size={15} /> : index + 1}</span>
                  <small>{label}</small>
                </div>
              ))}
            </div>
            <form onSubmit={submit}>
              {step === 0 && (
                <label className="portal-field">
                  <span>{order.service}</span>
                  <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
                    <option value="">{order.service}</option>
                    {t.services.map((service) => (
                      <option key={service[3]} value={service[3]}>{service[1]}</option>
                    ))}
                  </select>
                </label>
              )}
              {step === 1 && (
                <div className="portal-fields">
                  <label className="portal-field">
                    <span>{order.name}</span>
                    <input
                      autoComplete="name"
                      maxLength={100}
                      required
                      value={name}
                      placeholder={order.namePlaceholder}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label className="portal-field">
                    <span>{order.phone}</span>
                    <input
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={30}
                      required
                      value={phone}
                      placeholder={order.phonePlaceholder}
                      onChange={(event) => setPhone(event.target.value)}
                    />
                  </label>
                </div>
              )}
              {step === 2 && (
                <label className="portal-field">
                  <span>{order.description}</span>
                  <textarea
                    rows={5}
                    maxLength={2000}
                    required
                    value={description}
                    placeholder={order.descriptionPlaceholder}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              )}
              {step === 3 && (
                <div className="portal-field">
                  <span>{order.photos}</span>
                  <p className="portal-help">{order.photoHelp}</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      setPhotos(Array.from(event.target.files ?? []))
                      setError('')
                    }}
                  />
                  {photos.length > 0 && (
                    <ul className="photo-file-list">
                      {photos.map((photo, index) => (
                        <li key={`${photo.name}-${index}`}>
                          <span>{photo.name}</span>
                          <button
                            type="button"
                            onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                          >
                            {order.removePhoto}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {step === 4 && (
                <dl className="order-review">
                  <div><dt>{order.service}</dt><dd>{t.services[serviceIndex]?.[1]}</dd></div>
                  <div><dt>{order.name}</dt><dd>{name}</dd></div>
                  <div><dt>{order.phone}</dt><dd>{phone}</dd></div>
                  <div><dt>{order.description}</dt><dd>{description}</dd></div>
                  <div><dt>{order.photos}</dt><dd>{photos.length}</dd></div>
                </dl>
              )}
              {error && <p className="portal-error" role="alert">{error}</p>}
              <div className="portal-form-actions">
                {step > 0 && (
                  <button type="button" className="btn btn-outline" disabled={submitting} onClick={() => { setError(''); setStep((current) => current - 1) }}>
                    {order.back}
                  </button>
                )}
                {step < 4 ? (
                  <button key="continue" type="button" className="btn btn-primary" onClick={next}>
                    {order.continue}
                    <Icon name="arrowRight" size={17} />
                  </button>
                ) : (
                  <button key="submit" type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? order.submitting : order.submit}
                  </button>
                )}
              </div>
            </form>
          </>
        ) : (
          <div className="order-success">
            <span className="order-success-icon"><Icon name="check" size={24} /></span>
            <p>{order.orderCreated}</p>
            <p><strong>{order.orderNumber}: {createdOrder.orderId}</strong></p>
            <p className="portal-help">{order.trackingSubtitle}</p>
            <a className="btn btn-primary" href={createdOrder.trackingUrl}>{order.trackOrder}</a>
            <button type="button" className="btn btn-outline" onClick={onClose}>{order.close}</button>
          </div>
        )}
      </section>
    </div>
  )
}

export function OrderTrackingPage({ token, t, lang, setLang, theme, onThemeToggle }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const orderText = t.order

  useEffect(() => {
    let active = true
    request(`/api/orders/track/${encodeURIComponent(token)}`)
      .then((data) => { if (active) setResult(data) })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.status === 404
              ? orderText.trackingError
              : requestError.message === 'SERVICE_API_UNAVAILABLE'
                ? orderText.apiUnavailable
                : requestError.message,
          )
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, orderText.trackingError, orderText.apiUnavailable])

  const order = result?.order
  const serviceIndex = order ? t.services.findIndex((service) => service[3] === order.serviceId) : -1
  const currentIndex = WORKFLOW_STATUS.indexOf(order?.status)

  return (
    <main className="portal-page">
      <RouteHeader
        title={orderText.trackingTitle}
        back="/"
        lang={lang}
        setLang={setLang}
        theme={theme}
        onThemeToggle={onThemeToggle}
        t={t}
      />
      <section className="portal-panel tracking-panel">
        <p className="portal-intro">{orderText.trackingSubtitle}</p>
        {loading && <p className="portal-loading">{orderText.trackingLoading}</p>}
        {!loading && error && <p className="portal-error" role="alert">{error}</p>}
        {order && (
          <>
            <div className="tracking-order-heading">
              <div>
                <span className="portal-kicker">{orderText.orderNumber}</span>
                <h2>{order.id}</h2>
              </div>
              <span className={`order-status-badge status-${order.status}`}>
                {orderText.statuses[order.status]}
              </span>
            </div>
            <p className="tracking-service">
              {serviceIndex >= 0 ? t.services[serviceIndex][1] : orderText.service}
            </p>
            <section className="tracking-progress" aria-label={orderText.progress}>
              <div className="tracking-progress-label">
                <strong>{orderText.progress}</strong>
                <span>{order.progress}%</span>
              </div>
              <div
                className="tracking-progress-track"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={order.progress}
              >
                <span style={{ width: `${order.progress}%` }} />
              </div>
              <p>{order.estimatedCompletion
                ? `${orderText.estimate}: ${formatDate(order.estimatedCompletion, lang)}`
                : orderText.noEstimate}
              </p>
            </section>
            {order.status === 'cancelled' ? (
              <p className="tracking-cancelled">{orderText.statuses.cancelled}</p>
            ) : (
              <section className="tracking-timeline">
                <h3>{orderText.timeline}</h3>
                <ol>
                  {WORKFLOW_STATUS.map((status, index) => {
                    const event = [...result.history].reverse().find((item) => item.status === status)
                    const complete = currentIndex >= 0 && index < currentIndex
                    const current = index === currentIndex
                    return (
                      <li
                        key={status}
                        className={`timeline-stage ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}`}
                      >
                        <span className="timeline-marker">
                          {complete ? <Icon name="check" size={14} /> : index + 1}
                        </span>
                        <div>
                          <strong>{orderText.statuses[status]}</strong>
                          {event && (
                            <>
                              <time dateTime={event.createdAt}>{formatDate(event.createdAt, lang)}</time>
                              {event.note && <p>{event.note}</p>}
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}
            <p className="tracking-created">{orderText.created}: {formatDate(order.createdAt, lang)}</p>
          </>
        )}
      </section>
    </main>
  )
}

export function AdminDashboard({ t, lang, setLang, theme, onThemeToggle }) {
  const [authenticated, setAuthenticated] = useState(null)
  const [password, setPassword] = useState('')
  const [orders, setOrders] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('')
  const [estimate, setEstimate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const orderText = t.order
  const selectedOrder = orders.find((order) => order.id === selectedId)

  const loadOrders = async () => {
    const data = await request('/api/admin/orders')
    const selected = data.orders.find((order) => order.id === selectedId) ?? data.orders[0]
    setOrders(data.orders)
    setSelectedId(selected?.id ?? '')
    setStatus(selected?.status ?? '')
    setEstimate(selected?.estimatedCompletion?.slice(0, 10) ?? '')
    setAuthenticated(true)
  }

  useEffect(() => {
    let active = true
    request('/api/admin/session')
      .then(async (session) => {
        if (!active) return
        if (!session.authenticated) {
          setAuthenticated(false)
          return
        }
        const data = await request('/api/admin/orders')
        if (!active) return
        setOrders(data.orders)
        setSelectedId(data.orders[0]?.id ?? '')
        setStatus(data.orders[0]?.status ?? '')
        setEstimate(data.orders[0]?.estimatedCompletion?.slice(0, 10) ?? '')
        setAuthenticated(true)
      })
      .catch((requestError) => {
        if (!active) return
        if (requestError.status === 401) setAuthenticated(false)
        else setError(requestError.message)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const signIn = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      setPassword('')
      setLoading(true)
      await loadOrders()
    } catch (requestError) {
      setError(
        requestError.message === 'SERVICE_API_UNAVAILABLE'
          ? orderText.apiUnavailable
          : requestError.message || orderText.adminError,
      )
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      await request('/api/admin/logout', { method: 'POST' })
      setAuthenticated(false)
      setOrders([])
      setSelectedId('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const saveOrder = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await request(`/api/admin/orders/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, estimatedCompletion: estimate || null, note }),
      })
      await loadOrders()
      setNote('')
      setMessage(orderText.updated)
    } catch (requestError) {
      setError(requestError.message || orderText.adminError)
    } finally {
      setSaving(false)
    }
  }

  const serviceName = (serviceId) => {
    const service = t.services.find((item) => item[3] === serviceId)
    return service?.[1] ?? serviceId
  }

  return (
    <main className="portal-page">
      <RouteHeader
        title={orderText.adminTitle}
        back="/"
        lang={lang}
        setLang={setLang}
        theme={theme}
        onThemeToggle={onThemeToggle}
        t={t}
      />
      <section className="portal-panel admin-panel">
        <p className="portal-intro">{orderText.adminSubtitle}</p>
        {loading && <p className="portal-loading">{orderText.trackingLoading}</p>}
        {!loading && authenticated === false && (
          <form className="admin-login" onSubmit={signIn}>
            <h2>{orderText.adminLogin}</h2>
            <label className="portal-field">
              <span>{orderText.adminPassword}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="portal-error" role="alert">{error}</p>}
            <button className="btn btn-primary" type="submit">{orderText.signIn}</button>
          </form>
        )}
        {!loading && authenticated && (
          <>
            <div className="admin-toolbar">
              <p>{orders.length} {orderText.ordersCount}</p>
              <button type="button" className="btn btn-outline" onClick={signOut}>{orderText.signOut}</button>
            </div>
            {orders.length === 0 ? (
              <p className="portal-loading">{orderText.noOrders}</p>
            ) : (
              <div className="admin-layout">
                <nav className="admin-order-list" aria-label={orderText.adminTitle}>
                  {orders.map((order) => (
                    <button
                      type="button"
                      className={`admin-order-item ${order.id === selectedId ? 'is-selected' : ''}`}
                      key={order.id}
                      onClick={() => {
                        setSelectedId(order.id)
                        setStatus(order.status)
                        setEstimate(order.estimatedCompletion?.slice(0, 10) ?? '')
                        setNote('')
                        setMessage('')
                      }}
                    >
                      <strong>{order.id}</strong>
                      <span>{order.customerName}</span>
                      <small>{orderText.statuses[order.status]}</small>
                    </button>
                  ))}
                </nav>
                {selectedOrder && (
                  <div className="admin-order-detail">
                    <div className="admin-customer-card">
                      <span className="portal-kicker">{orderText.customer}</span>
                      <h2>{selectedOrder.customerName}</h2>
                      <a href={`tel:${selectedOrder.customerPhone}`}>{selectedOrder.customerPhone}</a>
                      <p>{serviceName(selectedOrder.serviceId)}</p>
                      <p>{selectedOrder.description}</p>
                      <p>{orderText.created}: {formatDate(selectedOrder.createdAt, lang)}</p>
                    </div>
                    <form className="admin-update-form" onSubmit={saveOrder}>
                      <label className="portal-field">
                        <span>{orderText.updateStatus}</span>
                        <select value={status} onChange={(event) => setStatus(event.target.value)}>
                          {ORDER_STATUSES.map((value) => (
                            <option key={value} value={value}>{orderText.statuses[value]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="portal-field">
                        <span>{orderText.estimate}</span>
                        <input type="date" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
                      </label>
                      <label className="portal-field">
                        <span>{orderText.note}</span>
                        <textarea
                          rows={3}
                          maxLength={1000}
                          value={note}
                          placeholder={orderText.notePlaceholder}
                          onChange={(event) => setNote(event.target.value)}
                        />
                      </label>
                      {error && <p className="portal-error" role="alert">{error}</p>}
                      {message && <p className="portal-success" role="status">{message}</p>}
                      <button className="btn btn-primary" type="submit" disabled={saving}>
                        {saving ? orderText.saving : orderText.saveUpdate}
                      </button>
                    </form>
                    {selectedOrder.attachments.length > 0 && (
                      <section className="admin-photos">
                        <h3>{orderText.photosForOrder}</h3>
                        <div>
                          {selectedOrder.attachments.map((file) => (
                            <a
                              href={`/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/files/${encodeURIComponent(file.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              key={file.id}
                            >
                              <img
                                src={`/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/files/${encodeURIComponent(file.id)}`}
                                alt={file.originalName}
                                loading="lazy"
                              />
                              <span>{file.originalName}</span>
                            </a>
                          ))}
                        </div>
                      </section>
                    )}
                    <section className="admin-history">
                      <h3>{orderText.timeline}</h3>
                      <ol>
                        {[...selectedOrder.history].reverse().map((entry, index) => (
                          <li key={`${entry.createdAt}-${index}`}>
                            <strong>{orderText.statuses[entry.status]}</strong>
                            <time dateTime={entry.createdAt}>{formatDate(entry.createdAt, lang)}</time>
                            <p>{entry.note || orderText.noNote}</p>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {error && authenticated !== false && <p className="portal-error" role="alert">{error}</p>}
      </section>
    </main>
  )
}
