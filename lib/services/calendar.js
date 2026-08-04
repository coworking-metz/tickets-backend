import {add, isAfter, sub} from 'date-fns'
import {zonedTimeToUtc} from 'date-fns-tz'
import got from 'got'
import IcalExpander from 'ical-expander'
import {compact, uniq} from 'lodash-es'
import crypto from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {getNumberFromSeed} from '../util/random.js'

const ONBOARDING_INSTRUCTIONS = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'onboarding', 'instructions.md'),
  'utf8'
).trim()

/**
 * Retrieve all events, sort them and add an id to each one
 */
export const getAllEvents = async (req, res) => {
  const filter = req.query.filter?.toLowerCase()
  const calendar = req.query.calendar?.toUpperCase()
  const allEvents = await Promise.all(compact([
    fetchCoworkingEvents().catch(error => {
      // Do not fail if some of the events are not available
      console.error('Unable to fetch Coworking events:', error)
      return []
    }),
    fetchAmourFoodEvents().catch(error => {
      console.error('Unable to fetch Amour Food events:', error)
      return []
    }),
    fetchBliiidaEvents().catch(error => {
      console.error('Unable to fetch Bliiida events:', error)
      return []
    }),
    fetchFluxusEvents().catch(error => {
      console.error('Unable to fetch Fluxus events:', error)
      return []
    }),
    req.isAdmin && fetchOnboardingAppointments().catch(error => {
      console.error('Unable to fetch onboarding appointments:', error)
      return []
    })
  ]))

  res.send(allEvents.flat()
    // Add an id to each event
    .filter(event => calendar ? event.calendar === calendar : true)
    .filter(event => filter ? Object.values(event).some(value =>
      String(value).toLowerCase().includes(filter)
    ) : true)
    .map(event => ({
      ...event,
      // https://medium.com/@chris_72272/what-is-the-fastest-node-js-hashing-algorithm-c15c1a0e164e
      id: crypto
        .createHash('sha1')
        .update(`${event.calendar}-${event.title}-${event.start}`)
        .digest('base64url')
    }))
    // From older to most recent
    .sort((a, b) => new Date(a.start) - new Date(b.start))
  )
}

const AMOUR_FOOD_API_BASE_URL = process.env.AMOUR_FOOD_API_BASE_URL || 'https://lamourfood.fr/wp-json/'

/**
 * Get Amour Food menus
 */
const fetchAmourFoodEvents = async () => {
  const events = await got.get('custom/v1/menu', {
    prefixUrl: AMOUR_FOOD_API_BASE_URL,
    timeout: {
      request: 5000
    }
  }).json()

  return events
    .filter(event => {
      const eventDay = zonedTimeToUtc(event.time * 1000, 'Europe/Paris')
      return isAfter(eventDay, sub(new Date(), {months: 1}))
    })
    .map(event => {
      const eventDay = zonedTimeToUtc(event.time * 1000, 'Europe/Paris')
      return {
        title: (event.details?.plat_viande || event.nom).trim(),
        description: event.description.replaceAll(/<[^>]*>?/gm, '').trim(), // Strip HTML tags
        start: add(eventDay, {hours: 12}).toISOString(),
        end: add(eventDay, {hours: 13, minutes: 30}).toISOString(),
        location: 'L\'Amour Food, 7 Av. de Blida, 57000 Metz',
        urls: [event.disponible && event.permalink].filter(Boolean),
        pictures: [event.illustration],
        calendar: 'AMOUR_FOOD'
      }
    })
}

const fetchCoworkingEvents = async () => fetchICSEvents(process.env.COWORKING_CALENDAR_URL)
  .then(events => events.map(e => ({
    ...e,
    calendar: 'COWORKING'
  })))

const fetchFluxusEvents = async () => fetchICSEvents(process.env.FLUXUS_CALENDAR_URL)
  .then(events => events.map(e => ({
    ...e,
    calendar: 'BLIIIDA'
  })))

const fetchBliiidaEvents = async () => fetchICSEvents(process.env.BLIIIDA_CALENDAR_URL)
  .then(events => events.map(e => ({
    ...e,
    calendar: 'BLIIIDA'
  })))

const ONBOARDING_PICTURES_URLS = [
  'https://images.unsplash.com/photo-1758691737584-a8f17fb34475?q=80&w=640&ext=.png',
  'https://images.unsplash.com/photo-1739285452618-0b7b3d04f953?q=80&w=640&ext=.png',
  'https://images.unsplash.com/photo-1758520144486-18f072e583ad?q=80&w=640&ext=.png',
  'https://images.unsplash.com/photo-1758873268933-e0765262e58d?q=80&w=640&ext=.png',
  'https://images.unsplash.com/photo-1758691737535-57edd2a11d73?q=80&w=640&ext=.png',
  'https://images.unsplash.com/photo-1714976326873-2e27a3988daf?q=80&w=640&ext=.png'
]

const fetchOnboardingAppointments = async () => fetchICSEvents(process.env.ONBOARDING_CALENDAR_URL)
  .then(events => events.map(e => ({
    ...e,
    calendar: 'ONBOARDING',
    pictures: [ONBOARDING_PICTURES_URLS[getNumberFromSeed(e.title) % ONBOARDING_PICTURES_URLS.length]],
    // Add onboarding instructions to the description
    description: `${e.description}\n\n---\n\n${ONBOARDING_INSTRUCTIONS}`
  })
  ))

/**
 * Get ICS events from the last month to the next three months.
 */
const fetchICSEvents = async calendarUrl => {
  if (!calendarUrl) {
    return []
  }

  const ics = await got(calendarUrl, {
    timeout: {
      request: 5000
    }
  }).text()

  const icalExpander = new IcalExpander({ics, maxIterations: 100})
  const now = new Date()
  const icsEvents = icalExpander.between(sub(now, {months: 1}), add(now, {months: 3}))

  const formattedEvents = icsEvents.events.map(e => formatICALEvent(e))
  const formattedOccurrences = icsEvents.occurrences.map(o => formatICALEvent({
    startDate: o.startDate,
    endDate: o.endDate,
    summary: o.item.summary,
    description: o.item.description,
    location: o.item.location
  }))
  const allEvents = [...formattedEvents, ...formattedOccurrences]

  return allEvents
}

/**
 * Format an ICAL event to our own structure.
 * Retrieve links and images from the description and remove them from the description.
 */
const formatICALEvent = event => {
  const description = (event.description ?? '')
    .replaceAll('&amp;', '&') // Because special HTML characters can sometimes appear in URLs

  const strippedDescription = description
    .replaceAll(/<br>/gm, '\n') // Replace <br> tags with new lines
    .replaceAll(/<[^>]*>?/gm, '') // Strip other HTML tags

  const {urls, text: descriptionWithoutLonelyUrls} = extractLonelyUrls(strippedDescription)

  const trimmedDescription = descriptionWithoutLonelyUrls
    .replaceAll('^[\n]', '') // Strip new lines at the beginning
    .replaceAll('[\n]$', '') // Strip new lines at the end
    .replaceAll(/(?<!]\()(?<!\[)https?:\/\/[^\s\])]+/g, '[$&]($&)') // Replace remaining urls (not already in a Markdown link) by a markdown link with the url as text
    .trim()

  let start = event.startDate.toJSDate().toISOString()
  let end = event.endDate.toJSDate().toISOString()
  const startingTime = start.slice(11, 16)
  const endingTime = end.slice(11, 16)
  if (startingTime === endingTime && startingTime === '00:00') {
    start = zonedTimeToUtc(start, 'Europe/Paris')
    end = zonedTimeToUtc(end, 'Europe/Paris')
  }

  return {
    title: event.summary.trim(),
    description: trimmedDescription,
    start,
    end,
    location: event.location,
    urls: urls.filter(url => !isImage(url)),
    pictures: urls.filter(url => isImage(url))
  }
}

/**
 * Extract all lonely URLs from a text
 * A lonely URL is a URL that is not part of a Markdown link, and that is not prefixed by a semicolon and a space like "Example: URL"
 *
 * @param {string} text - The text to extract URLs from
 * @returns {{urls: string[], text: string}} An object containing the extracted URLs and the text without the URLs
 */
const extractLonelyUrls = text => {
  if (typeof text !== 'string') {
    throw new TypeError(`Cannot extract urls from anything other than a string, got ${typeof text}`)
  }

  // Regular expression to match URLs, excluding those in Markdown links
  // and those prefix by a semicolon and a space like "Example: URL"
  const regexp = /(?<!]\()(?<!:\s)(?<!\[[^\]]*]\()(?<!\[[^\]]*]:\s*)\bhttps?:\/\/[^\s<>\])]+/g
  const bracketsRegexp = /[[\]]/g

  const urls = text.match(regexp) || []

  return {
    urls: uniq(urls.map(item => item.replaceAll(bracketsRegexp, ''))),
    text: text.replaceAll(regexp, '')
  }
}

const isImage = url => url.match(/\.(jpeg|jpg|gif|png)$/) !== null
