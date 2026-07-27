#!/usr/bin/env node

/* eslint-disable no-await-in-loop */
/* eslint-disable no-promise-executor-return */

import 'dotenv/config.js'
import process from 'node:process'
import mongo from '../lib/util/mongo.js'
import {upsertBookings} from '../lib/models/bookings.js'
import {clickBySelector, getRooms, openBliiida, openRoomPlanning, scrapeWeek} from '../lib/util/bookings.js'

const args = process.argv.slice(2)
const showUi = args.includes('--show-ui')

const {browser, page} = await openBliiida({showUi})

await clickBySelector(page, '[type="button"][onclick]', {text: 'Ressources'})

await clickBySelector(page, '[type="button"][onclick]', {text: 'Agenda partagé'})

// --------------------------------------------
// 🚀 Crawl each room
// --------------------------------------------

for (const room of getRooms()) {
  console.log(`Fetching availability for room: ${room}`)

  await openRoomPlanning(page, room)

  const results = []

  // --------------------------------------------
  // 📅 Scrape 3 weeks
  // --------------------------------------------
  for (let week = 0; week < 3; week++) {
    console.log(` Scraping week ${week + 1}...`)
    const weekData = await scrapeWeek(page)
    results.push(...weekData)

    await page.click('a[href*="__OnAffichePeriodeSuivante"]')
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  const bookings = await upsertBookings(room, results)

  console.log(`✔️ Upserted ${bookings.length} bookings for room ${room}`)
}

// --------------------------------------------
if (!showUi) {
  await browser.close()
}

await mongo.disconnect()
console.log('Done!')
