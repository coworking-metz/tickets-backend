/* eslint-disable no-eval */
 
/* eslint-disable no-promise-executor-return */

import puppeteer from 'puppeteer'
import process from 'node:process'
import mongo from './mongo.js'

export async function waitOnPage(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

export async function openRoomPlanning(page, room) {
  const inputSelector = 'ul:has(label[for]):has(input[type="text"]) input[type="text"]'
  await page.waitForSelector(inputSelector, {visible: true})
  await page.click(inputSelector, {clickCount: 3})
  await page.type(inputSelector, room)

  await page.waitForSelector('#ui-id-1', {visible: true})
  await page.click('#ui-id-1 a')
  await page.click('.fa-magnifying-glass')

  // Const loaderSelector = 'div table img[src="/BLIIIDAPP_WEB/res/IMG-Chargement-20_A0E06DBC_.svg"]'

  // // 1️⃣ Wait until loader appears (request started)
  // await page.waitForSelector(loaderSelector, {visible: true})

  // // 2️⃣ Wait until loader disappears (request ended)
  // await page.waitForSelector(loaderSelector, {hidden: true})

  // 3️⃣ Wait for planner to be rendered
  await page.waitForSelector('#A1_WDPLN-ZoneTitresHorizontal', {visible: true})
}

export function getRooms() {
  const rooms = process.env.BLIIIDA_ROOMS ? process.env.BLIIIDA_ROOMS.split(',') : []
  return rooms
}

export async function actionBySelector(page, selector, action, {text = '', waitForSelector = false} = {}) {
  if (action === 'click') {
    action = 'el => el.click()'
  }

  if (waitForSelector) {
    console.log(`Waiting for selector: ${selector}`)
    await page.waitForSelector(selector, {visible: true})
  }

  console.log(`Action ${action} on element: selector="${selector}" text="${text}"`)

  return page.evaluate((selector, text, action) => {
    let el
    if (text) {
      const target = text.trim().toLowerCase()
      const elements = [...document.querySelectorAll(selector)]

      const match = elements.find(el => {
        const content = el.textContent?.trim().toLowerCase() || ''
        return content.includes(target)
      })

      el = match
    } else {
      el = document.querySelector(selector)
    }

    if (!el) {
      return false
    }

    let response
    eval(`response = (${action.toString()})(el)`)
    return response
  }, selector, text, action)
}

/**
 * Click the first element matching a selector AND whose innerText contains a given substring.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} selector - CSS selector.
 * @param {string} text - Substring to match (case-insensitive, trimmed).
 * @returns {Promise<boolean>} true if clicked, false if not found.
 *
 * The function:
 * - queries all elements matching the selector
 * - normalizes text content (trim + lowercase)
 * - finds the first that contains the provided text
 * - triggers click() inside the browser context
 */
export async function clickBySelector(page, selector, {text = '', waitForSelector = false} = {}) {
  return actionBySelector(page, selector, 'click', {text, waitForSelector})
}

/**
 * Opens app.bliiida.fr, performs login, and returns an authenticated Puppeteer page.
 *
 * @param {string} login - User login (email).
 * @param {string} password - User password.
 * @param {boolean} showUi - Set to true to run a visible browser.
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page}>}
 *
 * This function:
 * - launches a browser
 * - navigates to the homepage
 * - performs login
 * - returns the authenticated page (still logged in)
 */

export async function openBliiida({showUi = false}) {
  const {BLIIIDA_LOGIN, BLIIIDA_PASSWORD} = process.env
  if (!BLIIIDA_LOGIN || !BLIIIDA_PASSWORD) {
    throw new Error('Missing credentials: BLIIIDA_LOGIN or BLIIIDA_PASSWORD')
  }

  const browser = await puppeteer.launch({
    headless: !showUi,
    defaultViewport: null
  })

  const page = await browser.newPage()
  await page.goto('https://app.bliiida.fr/', {waitUntil: 'networkidle0'})

  await page.waitForSelector('[name="A38"]')
  await page.type('[name="A38"]', BLIIIDA_LOGIN)

  await page.waitForSelector('[name="A9"]')
  await page.type('[name="A9"]', BLIIIDA_PASSWORD)

  await page.click('#A10')
  await page.waitForNavigation({waitUntil: 'networkidle0'})
  console.log('Login completed')

  return {browser, page}
}

export async function scrapeWeek(page) {
  return page.evaluate(() => {
    const days = []

    // Find the vertical grid
    const hourRows = document.querySelectorAll('#A1_WDPLN-ZoneTitresVertical .WDPLN-HeureLibelle span')

    // Reference grid cell 7:00 → 8:00
    const first = hourRows[0].getBoundingClientRect()
    const second = hourRows[1].getBoundingClientRect()

    const hourPx = second.top - first.top
    const gridTop = first.top

    const dayHeaders = [...document.querySelectorAll('#A1_WDPLN-ZoneTitresHorizontal tr:nth-child(2) td div')]
      .map(e => e.innerText.trim())

    const containers = [...document.querySelectorAll('.WDPLN-ConteneurRendezVous[id^="A1_WDPLN-Conteneur_"]')]

    for (const [idx, col] of containers.entries()) {
      const slots = []
      const items = col.querySelectorAll('[id^="A1_WDPLN-RendezVous_"]')

      for (const item of items) {
        const bb = item.getBoundingClientRect()
        const title = item.querySelector('li')?.textContent.trim() || ''

        slots.push({
          title,
          top: bb.top,
          height: bb.height
        })
      }

      days.push({
        day: dayHeaders[idx],
        slots,
        hourPx,
        gridTop
      })
    }

    return days
  })
}

export function toTimeString(hourFloat) {
  const hour = Math.floor(hourFloat)
  const mins = Math.round((hourFloat % 1) * 60)
  return `${hour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

