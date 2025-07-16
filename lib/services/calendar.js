import {add, isAfter, sub} from 'date-fns'
import {zonedTimeToUtc} from 'date-fns-tz'
import got from 'got'
import {uniq} from 'lodash-es'
import crypto from 'node:crypto'
import process from 'node:process'
import IcalExpander from 'ical-expander'

/**
 * Retrieve all events, sort them and add an id to each one
 */
export const getAllEvents = async (req, res) => {
  const filter = req.query.filter?.toLowerCase()
  const calendar = req.query.calendar?.toUpperCase()
  const allEvents = await Promise.all([
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
    })
  ])

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
      request: 10_000 // 10 seconds
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

const fetchBliiidaEvents = async () => fetchICSEvents(process.env.BLIIIDA_CALENDAR_URL)
  .then(events => events.map(e => ({
    ...e,
    calendar: 'BLIIIDA'
  })))

/**
 * Get ICS events from the last month to the next three months.
 */
const fetchICSEvents = async calendarUrl => {
  if (!calendarUrl) {
    return []
  }

  const ics = await got(calendarUrl).text()

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
  const description = event.description
    .replaceAll('&amp;', '&') // Because special HTML characters can sometimes appear in URLs

  const strippedDescription = description
    .replaceAll(/<br>/gm, '\n') // Replace <br> tags with new lines
    .replaceAll(/<[^>]*>?/gm, '') // Strip other HTML tags

  const {urls, text: descriptionWithoutUrls} = extractUrls(strippedDescription)

  const trimmedDescription = descriptionWithoutUrls
    .replaceAll('^[\n]', '') // Strip new lines at the beginning
    .replaceAll('[\n]$', '') // Strip new lines at the end
    .trim()

  return {
    title: event.summary.trim(),
    description: trimmedDescription,
    start: event.startDate.toJSDate().toISOString(),
    end: event.endDate.toJSDate().toISOString(),
    location: event.location,
    urls: urls.filter(url => !isImage(url)),
    pictures: urls.filter(url => isImage(url))
  }
}

/**
 * Extract all urls from a text
 */
const extractUrls = text => {
  if (typeof text !== 'string') {
    throw new TypeError(`Cannot extract urls from anything other than a string, got ${typeof text}`)
  }

  // Regular expression to match URLs, excluding those in Markdown links or images
  const regexp = /(?<!]\()(?<!]:\s)(?<!\[[^\]]*]\()(?<!\[[^\]]*]:\s*)\bhttps?:\/\/[^\s<>\])]+/g
  const bracketsRegexp = /[[\]]/g

  const urls = text.match(regexp) || []

  return {
    urls: uniq(urls.map(item => item.replaceAll(bracketsRegexp, ''))),
    text: text.replaceAll(regexp, '')
  }
}

const isImage = url => url.match(/\.(jpeg|jpg|gif|png)$/) !== null
