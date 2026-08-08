import { useState, type FormEvent } from 'react'
import { hotels, type Hotel } from './data/hotels'

type Booking = {
  hotelId: string
  name: string
  email: string
  checkIn: string
  checkOut: string
  rooms: number
  guests: number
  occasion: string
}

const today = new Date().toISOString().slice(0, 10)

function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return Math.max(diff, 0)
}

function App() {
  const [selectedId, setSelectedId] = useState(hotels[0].id)
  const [booking, setBooking] = useState<Booking>({
    hotelId: hotels[0].id,
    name: '',
    email: '',
    checkIn: today,
    checkOut: '',
    rooms: 10,
    guests: 20,
    occasion: 'Team offsite',
  })
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const selected =
    hotels.find((hotel) => hotel.id === selectedId) ?? hotels[0]
  const nights = nightsBetween(booking.checkIn, booking.checkOut)
  const estimate =
    nights > 0 ? nights * booking.rooms * selected.nightlyFrom : 0

  function selectHotel(hotel: Hotel) {
    setSelectedId(hotel.id)
    setBooking((current) => ({ ...current, hotelId: hotel.id }))
    setConfirmation(null)
    setError('')
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' })
  }

  function updateField<K extends keyof Booking>(key: K, value: Booking[K]) {
    setBooking((current) => ({ ...current, [key]: value }))
    setConfirmation(null)
    setError('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!booking.name.trim() || !booking.email.trim()) {
      setError('Add a contact name and email to hold the block.')
      return
    }

    if (!booking.checkOut || nights < 1) {
      setError('Choose a check-out date after check-in.')
      return
    }

    if (booking.rooms < 5) {
      setError('Room blocks start at 5 rooms.')
      return
    }

    if (booking.rooms > selected.roomsAvailable) {
      setError(
        `${selected.name} currently has ${selected.roomsAvailable} rooms available for block.`,
      )
      return
    }

    const code = `HB-${selected.id.slice(0, 3).toUpperCase()}-${Math.floor(
      1000 + Math.random() * 9000,
    )}`
    setConfirmation(code)
    setError('')
  }

  return (
    <>
      <header className="site-header">
        <div className="brand-mark">HotelBlock</div>
        <nav className="nav-links" aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#stays">Stays</a>
          <a className="nav-cta" href="#book">
            Reserve a block
          </a>
        </nav>
      </header>

      <main>
        <section className="hero" aria-label="HotelBlock introduction">
          <div className="hero-media">
            <img
              src="https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=2000&q=80"
              alt="Sunlit hotel corridor with soft linen tones"
            />
          </div>
          <div className="hero-content">
            <h1 className="hero-brand">HotelBlock</h1>
            <p className="hero-copy">
              Hold exclusive room blocks for teams, weddings, and gatherings —
              without the endless sales call loop.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#book">
                Reserve a block
              </a>
              <a className="btn btn-ghost" href="#stays">
                Browse stays
              </a>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <p className="section-label">How it works</p>
          <h2 className="section-title">Three steps from idea to held rooms</h2>
          <p className="section-lead">
            Pick a property, set your dates and room count, and lock a hold
            while guests claim their own rooms.
          </p>
          <div className="how-grid">
            <article className="how-item">
              <h3>Choose the stay</h3>
              <p>
                Browse curated properties with real inventory set aside for
                group blocks.
              </p>
            </article>
            <article className="how-item">
              <h3>Shape the block</h3>
              <p>
                Set nights, room count, and occasion. We estimate the hold
                before you commit.
              </p>
            </article>
            <article className="how-item">
              <h3>Share the code</h3>
              <p>
                Guests book into your block with a private code. You keep the
                overview.
              </p>
            </article>
          </div>
        </section>

        <section className="section" id="stays">
          <div className="properties-header">
            <div>
              <p className="section-label">Featured inventory</p>
              <h2 className="section-title">Stays ready for a block</h2>
              <p className="section-lead">
                Select a property to prefill your reservation.
              </p>
            </div>
          </div>
          <div className="property-list">
            {hotels.map((hotel) => (
              <button
                key={hotel.id}
                type="button"
                className={`property${selectedId === hotel.id ? ' is-selected' : ''}`}
                onClick={() => selectHotel(hotel)}
              >
                <div className="property-media">
                  <img src={hotel.image} alt={hotel.name} loading="lazy" />
                </div>
                <div className="property-body">
                  <p className="property-meta">
                    {hotel.city} · {hotel.region}
                  </p>
                  <h3>{hotel.name}</h3>
                  <p>{hotel.vibe}</p>
                  <div className="property-stats">
                    <div>
                      <strong>{hotel.roomsAvailable}</strong>
                      rooms open
                    </div>
                    <div>
                      <strong>${hotel.nightlyFrom}</strong>
                      from / night
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="booking-shell" id="book">
          <div className="section">
            <p className="section-label">Reserve</p>
            <h2 className="section-title">Hold rooms at {selected.name}</h2>
            <p className="section-lead">
              Blocks start at five rooms. Your hold code is ready as soon as
              the form checks out.
            </p>

            <div className="booking-layout">
              <form className="booking-form" onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="hotel">Property</label>
                  <select
                    id="hotel"
                    value={booking.hotelId}
                    onChange={(event) => {
                      const nextId = event.target.value
                      setSelectedId(nextId)
                      updateField('hotelId', nextId)
                    }}
                  >
                    {hotels.map((hotel) => (
                      <option key={hotel.id} value={hotel.id}>
                        {hotel.name} — {hotel.city}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="name">Contact name</label>
                    <input
                      id="name"
                      value={booking.name}
                      onChange={(event) =>
                        updateField('name', event.target.value)
                      }
                      placeholder="Alex Rivera"
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      value={booking.email}
                      onChange={(event) =>
                        updateField('email', event.target.value)
                      }
                      placeholder="alex@company.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="checkIn">Check-in</label>
                    <input
                      id="checkIn"
                      type="date"
                      min={today}
                      value={booking.checkIn}
                      onChange={(event) =>
                        updateField('checkIn', event.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="checkOut">Check-out</label>
                    <input
                      id="checkOut"
                      type="date"
                      min={booking.checkIn || today}
                      value={booking.checkOut}
                      onChange={(event) =>
                        updateField('checkOut', event.target.value)
                      }
                      required
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="rooms">Rooms</label>
                    <input
                      id="rooms"
                      type="number"
                      min={5}
                      max={selected.roomsAvailable}
                      value={booking.rooms}
                      onChange={(event) =>
                        updateField('rooms', Number(event.target.value))
                      }
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="guests">Guests</label>
                    <input
                      id="guests"
                      type="number"
                      min={1}
                      value={booking.guests}
                      onChange={(event) =>
                        updateField('guests', Number(event.target.value))
                      }
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="occasion">Occasion</label>
                  <select
                    id="occasion"
                    value={booking.occasion}
                    onChange={(event) =>
                      updateField('occasion', event.target.value)
                    }
                  >
                    <option>Team offsite</option>
                    <option>Wedding weekend</option>
                    <option>Conference</option>
                    <option>Family reunion</option>
                    <option>Other gathering</option>
                  </select>
                </div>

                {error ? <p className="form-error">{error}</p> : null}

                <button className="btn btn-primary" type="submit">
                  Hold this block
                </button>
              </form>

              <aside className="booking-summary">
                {confirmation ? (
                  <div className="success-panel">
                    <h3>Block held</h3>
                    <p>
                      {booking.name}, your {booking.rooms}-room hold at{' '}
                      {selected.name} is reserved under code{' '}
                      <strong>{confirmation}</strong>. Share it with guests so
                      they can claim rooms.
                    </p>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => setConfirmation(null)}
                    >
                      Edit hold
                    </button>
                  </div>
                ) : (
                  <>
                    <h3>{selected.name}</h3>
                    <p>
                      {selected.city}, {selected.region}.{' '}
                      {selected.roomsAvailable} rooms currently open for group
                      holds.
                    </p>
                    <div className="summary-lines">
                      <div className="summary-line">
                        <span>Nights</span>
                        <strong>{nights || '—'}</strong>
                      </div>
                      <div className="summary-line">
                        <span>Rooms</span>
                        <strong>{booking.rooms}</strong>
                      </div>
                      <div className="summary-line">
                        <span>Estimated total</span>
                        <strong>
                          {estimate
                            ? `$${estimate.toLocaleString()}`
                            : 'Add dates'}
                        </strong>
                      </div>
                    </div>
                    <p>
                      Estimates use the property’s starting nightly rate and
                      update as you shape the block.
                    </p>
                  </>
                )}
              </aside>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <strong>HotelBlock</strong> · room holds for gatherings that matter
        </div>
        <div>Demo app · no payment captured</div>
      </footer>
    </>
  )
}

export default App
