import mongo from '../util/mongo.js'

/* eslint-disable no-await-in-loop */

export async function upsertBookings(room, rawBookings) {
  await mongo.connect()
  const bookingsCol = mongo.db.collection('bliiida_bookings')

  // --------------------------------------------
  // 🗓️ Convert dates & handle year rollover
  // --------------------------------------------
  {
    const months = {
      janvier: 0,
      février: 1, fevrier: 1,
      mars: 2,
      avril: 3,
      mai: 4,
      juin: 5,
      juillet: 6,
      août: 7, aout: 7,
      septembre: 8,
      octobre: 9,
      novembre: 10,
      décembre: 11, decembre: 11
    }

    const baseYear = new Date().getFullYear()
    let offset = 0
    let prev = null

    for (const day of rawBookings) {
      const parts = day.day.trim().split(/\s+/)
      const num = Number.parseInt(parts[1], 10)
      const month = months[parts[2].toLowerCase()]

      let d = new Date(Date.UTC(baseYear + offset, month, num))
      if (prev && d < prev) {
        offset++
        d = new Date(Date.UTC(baseYear + offset, month, num))
      }

      day.date = d
      prev = d
    }
  }

  // Await new Promise(resolve => setTimeout(resolve, 2000))
  // --------------------------------------------
  // 🕒 Canonical half-day bookings
  // --------------------------------------------
  const canonicalBookings = []

  for (const day of rawBookings) {
    const morningSlots = day.slots.filter(s => s.top < (12 * day.hourPx + day.gridTop))
    const afternoonSlots = day.slots.filter(s => s.top >= (12 * day.hourPx + day.gridTop))

    canonicalBookings.push({
      room,
      date: day.date,
      start: '08:00',
      end: '12:00',
      status: morningSlots.length > 0 ? 'available' : 'booked',
      bookingType: 'default'
    }, {
      room,
      date: day.date,
      start: '13:00',
      end: '17:00',
      status: afternoonSlots.length > 0 ? 'available' : 'booked',
      bookingType: 'default'
    })
  }

  const bookings = []
  // --------------------------------------------
  // 💾 Save (UPSERT) — No duplicates
  // --------------------------------------------
  for (const booking of canonicalBookings) {
    const normalizedDate
    = booking.date instanceof Date
      ? booking.date.toISOString().slice(0, 10) // YYYY-MM-DD
      : String(booking.date)

    bookings.push(await bookingsCol.updateOne(
      {
        room: booking.room,
        date: normalizedDate,
        start: booking.start,
        end: booking.end,
        bookingType: booking.bookingType
      },
      {
        $set: {
          ...booking,
          date: normalizedDate
        }
      },
      {upsert: true}
    ))
  }

  return bookings
}

export async function upsertBooking(booking) {
  await mongo.connect()
  const bookingsCol = mongo.db.collection('bliiida_bookings')

  let normalizedDate = booking.date
  if (booking.date instanceof Date) {
    normalizedDate = booking.date.toISOString().slice(0, 10) // YYYY-MM-DD
  }

  const payload = {
    room: booking.room,
    date: normalizedDate,
    start: booking.start,
    end: booking.end,
    status: booking.status,
    bookingType: booking.bookingType
  }
  TODO
  console.log('Upserting booking:', payload)
  return bookingsCol.updateOne(
    payload,
    {
      $set: {
        ...booking,
        date: normalizedDate
      }
    },
    {upsert: true}
  )
}

export async function addBooking(booking) {
  const bookingsCol = mongo.db.collection('bliiida_bookings')

  // ---------------------------------------------
  // Validate date input
  // ---------------------------------------------
  if (typeof booking.date !== 'string') {
    throw new TypeError(
      `booking.date must be a YYYY-MM-DD string. Got: ${String(booking.date)}`
    )
  }

  // Quick format check
  // YYYY-MM-DD pattern
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)) {
    throw new TypeError(
      `Invalid booking.date format: "${booking.date}. Expected "YYYY-MM-DD"`
    )
  }

  // ---------------------------------------------
  // Build payload (no mutation)
  // ---------------------------------------------
  const payload = {
    ...booking,
    // Date is now stored as a pure string
    date: booking.date,
    status: booking.status || 'booked',
    bookingType: booking.bookingType || 'coworking'
  }

  // ---------------------------------------------
  // Validate times (HH:ii format)
  // ---------------------------------------------
  if (typeof payload.start !== 'string' || typeof payload.end !== 'string') {
    throw new TypeError(
      'booking.start and booking.end must be "HH:ii" strings'
    )
  }

  // Parse hours
  const startHour = Number.parseInt(payload.start.split(':')[0], 10)
  const endHour = Number.parseInt(payload.end.split(':')[0], 10)

  // ---------------------------------------------
  // 🚫 Forbidden zone: 12:00–13:00
  // ---------------------------------------------
  const forbiddenStart = 12
  const forbiddenEnd = 13

  // Any overlap with 12–13 → reject
  if (
    (startHour < forbiddenEnd && endHour > forbiddenStart)
    && !(startHour >= 13 || endHour <= 12)
  ) {
    throw new Error(
      'Invalid booking time: bookings cannot overlap 12:00–13:00 '
      + `(${payload.start} → ${payload.end})`
    )
  }

  // ---------------------------------------------
  // Determine which half-day
  // ---------------------------------------------
  const isMorning = startHour < 13

  const parentStart = isMorning ? '08:00' : '13:00'
  const parentEnd = isMorning ? '12:00' : '17:00'

  // ---------------------------------------------
  // Find parent default booking
  // ---------------------------------------------
  const parent = await bookingsCol.findOne({
    room: payload.room,
    date: payload.date,
    start: parentStart,
    end: parentEnd,
    bookingType: 'default'
  })
  if (!parent) {
    throw new Error(
      'No default half-day exists for this booking: '
      + `room: ${payload.room} date: ${payload.date} `
      + `(${parentStart} → ${parentEnd})`
    )
  }

  if (parent.status === 'booked') {
    throw new Error(
      'Half-day is already booked: '
      + `room: ${payload.room} date: ${payload.date} `
      + `(${parentStart} → ${parentEnd})`
    )
  }

  // ---------------------------------------------
  // Duplicate check for this booking type
  // ---------------------------------------------
  const existing = await bookingsCol.findOne({
    room: payload.room,
    date: payload.date,
    start: payload.start,
    end: payload.end,
    bookingType: payload.bookingType
  })

  if (existing) {
    throw new Error(
      'Booking already exists: '
      + `room: ${payload.room} `
      + `date: ${payload.date} `
      + `start: ${payload.start} `
      + `end: ${payload.end} `
      + `type: ${payload.bookingType} `
      + (payload.memberId ? `member: ${payload.memberId}` : '')
    )
  }

  // ---------------------------------------------
  // Insert
  // ---------------------------------------------
  const res = await bookingsCol.insertOne(payload)
  return {...payload, _id: res.insertedId}
}
/* eslint-enable no-await-in-loop */
