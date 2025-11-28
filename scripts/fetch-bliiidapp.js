#!/usr/bin/env node

/* eslint-disable no-await-in-loop */
/* eslint-disable no-promise-executor-return */

import 'dotenv/config.js'
import process from 'node:process'
import puppeteer from 'puppeteer'
import mongo from '../lib/util/mongo.js'
import {scrapeWeek} from '../lib/util/bookings.js'

const args = process.argv.slice(2)
const showUi = args.includes('--show-ui')

const {BLIIIDA_LOGIN} = process.env
const {BLIIIDA_PASSWORD} = process.env

if (!BLIIIDA_LOGIN || !BLIIIDA_PASSWORD) {
  console.error('Missing credentials: BLIIIDA_LOGIN or BLIIIDA_PASSWORD')
  process.exit(1)
}

// --------------------------------------------
// 🚀 Connect Mongo
// --------------------------------------------
await mongo.connect()
const bookingsCol = mongo.db.collection('bliiida_bookings')

// --------------------------------------------
// 🚀 Puppeteer
// --------------------------------------------
const browser = await puppeteer.launch({
  headless: !showUi,
  defaultViewport: null
})

const page = await browser.newPage()

await page.goto('https://app.bliiida.fr/', {
  waitUntil: 'networkidle0'
})

// --------------------------------------------
// 🚀 Login
// --------------------------------------------
await page.waitForSelector('[name="A38"]')
await page.type('[name="A38"]', BLIIIDA_LOGIN)

await page.waitForSelector('[name="A9"]')
await page.type('[name="A9"]', BLIIIDA_PASSWORD)

await page.click('#A10')
await page.waitForNavigation({waitUntil: 'networkidle0'})
console.log('Login completed')

// --------------------------------------------
// 🚀 Switch to Planner
// --------------------------------------------
await page.waitForSelector('#ALIAS117')
await page.click('#ALIAS117')

await page.waitForSelector('#zrl_4_ALIAS113')
await page.click('#zrl_4_ALIAS113')
console.log('Planner opened')

// --------------------------------------------
// 🚀 Crawl each room
// --------------------------------------------
const rooms = process.env.BLIIIDA_ROOMS ? process.env.BLIIIDA_ROOMS.split(',') : []

for (const room of rooms) {
  console.log(`Fetching availability for room: ${room}`)

  await page.waitForSelector('[name="A3"]', {visible: true})
  await page.click('[name="A3"]', {clickCount: 3})
  await page.type('[name="A3"]', room)

  await page.waitForSelector('#ui-id-1', {visible: true})
  await page.click('#ui-id-1 a')
  await page.click('#A23')

  await page.waitForSelector('#A1_WDPLN-ZoneTitresHorizontal', {visible: true})

  const results = []

  // --------------------------------------------
  // 📅 Scrape 3 weeks
  // --------------------------------------------
  for (let week = 0; week < 3; week++) {
    const weekData = await scrapeWeek(page)
    results.push(...weekData)

    await page.click('a[href*="__OnAffichePeriodeSuivante"]')
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

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

    for (const day of results) {
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

  // --------------------------------------------
  // 🕒 Canonical half-day bookings
  // --------------------------------------------
  const canonicalBookings = []

  for (const day of results) {
    const morningSlots = day.slots.filter(s => s.top < (12 * day.hourPx + day.gridTop))
    const afternoonSlots = day.slots.filter(s => s.top >= (12 * day.hourPx + day.gridTop))

    canonicalBookings.push({
      room,
      date: day.date,
      start: '8:00',
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

  // --------------------------------------------
  // 💾 Save (UPSERT) — No duplicates
  // --------------------------------------------
  for (const booking of canonicalBookings) {
    await bookingsCol.updateOne(
      {
        room: booking.room,
        date: booking.date,
        start: booking.start,
        end: booking.end,
        bookingType: booking.bookingType
      },
      {$set: booking},
      {upsert: true}
    )
  }

  console.log(`✔️ Upserted ${canonicalBookings.length} bookings for room ${room}`)
}

// --------------------------------------------
if (!showUi) {
  await browser.close()
}

await mongo.disconnect()
console.log('Done!')
