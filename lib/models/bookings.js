import mongo from '../util/mongo.js'

export async function addBooking(booking) {
  const bookingsCol = mongo.db.collection('bliiida_bookings')

  // ---------------------------------------------
  // Validate input
  // ---------------------------------------------
  if (typeof booking.date !== 'string') {
    throw new TypeError(
      `booking.date must be a YYYY-MM-DD string. Got: ${String(booking.date)}`
    )
  }

  // YYYY-MM-DD → Date @ 00:00 UTC
  const normalizedDate = new Date(`${booking.date}T00:00:00Z`)

  if (isNaN(normalizedDate.getTime())) {
    throw new TypeError(
      `Invalid booking.date format: "${booking.date}". Expected "YYYY-MM-DD"`
    )
  }

  // ---------------------------------------------
  // Prepare payload (do not mutate input)
  // ---------------------------------------------
  const payload = {
    ...booking,
    date: normalizedDate,
    status: booking.status || 'booked',
    bookingType: booking.bookingType || 'coworking'
  }

  // ---------------------------------------------
  // Duplicate check
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
      'A booking already exists: '
      + `room="${payload.room}" `
      + `date="${booking.date}" `
      + `start="${payload.start}" `
      + `end="${payload.end}" `
      + `type="${payload.bookingType}" `
      + (payload.memberId ? `member="${payload.memberId}"` : '')
    )
  }

  // ---------------------------------------------
  // Insert
  // ---------------------------------------------
  const res = await bookingsCol.insertOne(payload)
  return {...payload, _id: res.insertedId}
}
