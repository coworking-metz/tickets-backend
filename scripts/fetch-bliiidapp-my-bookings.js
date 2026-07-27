#!/usr/bin/env node

/* eslint-disable no-await-in-loop */

import 'dotenv/config.js'
import process from 'node:process'
import mongo from '../lib/util/mongo.js'
import {clickBySelector, getRooms, openBliiida, actionBySelector, waitOnPage} from '../lib/util/bookings.js'
import {upsertBooking} from '../lib/models/bookings.js'

const args = process.argv.slice(2)
const showUi = args.includes('--show-ui')

const {browser, page} = await openBliiida({showUi})

await clickBySelector(page, '[type="button"][onclick]', {text: 'Ressources'})

await clickBySelector(page, '[type="button"][onclick]', {text: 'Mes réservations'})

await actionBySelector(page, '[type="radio"][value="1"]', 'el=>{ el.checked = true; el.dispatchEvent(new Event("change"))}', {waitForSelector: true})

await waitOnPage(1)

await actionBySelector(page, 'td.webdevclass-riche', 'el=>console.log(el.closest("ol").querySelector(\'[style*="wbdispositioncell"]\'))', {waitForSelector: true, text: 'À venir'})

// Await page.evaluate(() => {
//   const items = [...document.querySelectorAll('td.webdevclass-riche')]
//   for (const item of items) {
//     if (item.textContent.includes('Le Hub')) {
//       item.innerHTML = 'Salle Cocorico'
//       return
//     }
//   }
// })
for (const room of getRooms()) {
  console.log(`Fetching my bookings for room: ${room}`)
  const bookings = await page.evaluate(room => {
    const target = room.trim().toLowerCase()

    // Grab ALL booking-related TDs
    const tds = [...document.querySelectorAll('[id*="con-A"] td.webdevclass-riche')]
      .map(td => td.textContent.trim())

    // Find only the date lines that belong to a matching room
    const results = []

    for (let i = 0; i < tds.length; i++) {
      const text = tds[i]

      // 1️⃣ Find cells that contain the room name
      const isRoom = text.toLowerCase().includes(target)
      if (!isRoom) {
        continue
      }

      // 2️⃣ Immediately look forward for the related "Date et heures" line
      const dateCell = tds.slice(i).find(t => t.includes('Date et heures'))
      if (!dateCell) {
        continue
      }

      // 3️⃣ Extract dates
      const match = dateCell.match(/Le\s+((?:\d{2}\/){2}\d{4})\s+de\s+(\d{2}:\d{2})\s+à\s+(\d{2}:\d{2})/)
      if (!match) {
        continue
      }

      const [, dateFr, start, end] = match
      const [d, m, y] = dateFr.split('/')

      results.push({
        room,
        date: `${y}-${m}-${d}`,
        start,
        end
      })
    }

    return results
  }, room)

  console.log('🔐 My Bookings in ' + room + ':', bookings)

  for (const booking of bookings) {
    await upsertBooking({
      room,
      date: booking.date,
      start: booking.start,
      end: booking.end,
      status: 'booked',
      bookingType: 'parent'
    })
  }
}

if (!showUi) {
  await browser.close()
}

await mongo.disconnect()
console.log('Done!')
