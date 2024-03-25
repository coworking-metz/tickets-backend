import {add, sub} from 'date-fns'
import {zonedTimeToUtc} from 'date-fns-tz'
import got from 'got'
import {uniq} from 'lodash-es'
import ical from 'node-ical'
import crypto from 'node:crypto'
import process from 'node:process'

/**
 * Retrieve all events, sort them and add an id to each one
 */
export const getAllEvents = async (req, res) => {
  const allEvents = await Promise.all([
    fetchCoworkingEvents().catch(error => {
      // Do not fail if some of the events are not available
      console.error('Unable to fetch Coworking events:', error)
      return []
    }),
    fetchAmourFoodEvents().catch(error => {
      console.error('Unable to fetch Amour Food events:', error)
      return []
    })
  ])

  res.send(allEvents.flat()
    // Add an id to each event
    .map(event => ({
      ...event,
      // https://medium.com/@chris_72272/what-is-the-fastest-node-js-hashing-algorithm-c15c1a0e164e
      id: crypto
        .createHash('sha1')
        .update(JSON.stringify(event))
        .digest('base64url')
    }))
    // Most recent first
    .sort((a, b) => new Date(b.start) - new Date(a.start))
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

  return events.map(event => {
    // Because the server is in Lettonia
    const eventDay = zonedTimeToUtc(event.time * 1000, 'Europe/Riga')
    return {
      title: event.nom,
      description: event.description.replaceAll(/<[^>]*>?/gm, ''), // Strip HTML tags
      start: add(eventDay, {hours: 12}).toISOString(),
      end: add(eventDay, {hours: 13, minutes: 30}).toISOString(),
      location: 'L\'Amour Food, 7 Av. de Blida, 57000 Metz',
      urls: [event.disponible && event.permalink].filter(Boolean),
      pictures: [event.illustration],
      category: 'AMOUR_FOOD'
    }
  })
}

/**
 * Get Coworking events from the last 30 days
 */
const fetchCoworkingEvents = async () => {
  if (!process.env.CALENDAR_EVENTS_URL) {
    return []
  }

  const events = await ical.async.fromURL(process.env.CALENDAR_EVENTS_URL)
  return Object.values(events)
    .filter(({type}) => type === 'VEVENT')
    .filter(({start}) => new Date(start) > sub(new Date(), {days: 30}))
    .map(vevent => ({
      ...formatVEvent(vevent),
      category: 'COWORKING'
    }))
}

/**
 * Format a VEVENT to our own structure.
 * Retrieve links and images from the description and remove them from the description.
 */
const formatVEvent = ({summary, description, start, end, location}) => {
  const urls = uniq(extractUrls(description))
  let strippedDescription = description
    .replaceAll(/<br>/gm, '\n') // Replace <br> tags with new lines
    .replaceAll(/<[^>]*>?/gm, '') // Strip other HTML tags

  // Strip urls from the description
  for (const url of urls) {
    strippedDescription = strippedDescription.replaceAll(url, '')
  }

  const trimmedDescription = strippedDescription
    .replaceAll('^[\n]', '') // Strip new lines at the beginning
    .replaceAll('[\n]$', '') // Strip new lines at the end
    .trim()

  return {
    title: summary,
    description: trimmedDescription,
    start,
    end,
    location,
    urls: urls.filter(url => !isImage(url)),
    pictures: urls.filter(url => isImage(url))
  }
}

/**
 * Extract all urls from a text
 */
const extractUrls = text => {
  if (text) {
    // Taken from https://github.com/huckbit/extract-urls/blob/master/index.js
    const regexp = /https?:\/\/(www\.)?[-\w@:%.+~#=]{1,256}\.[a-z\d()]{1,63}\b([-\w()'@:%+.~#?!&/=]*)/gi
    const bracketsRegexp = /[()]|\.$/g

    if (typeof text !== 'string') {
      throw new TypeError(`Cannot extract urls from anything other than a string, got ${typeof text}`)
    }

    const urls = text.match(regexp)
    if (urls) {
      return urls.map(item => item.replaceAll(bracketsRegexp, ''))
    }
  }

  return []
}

const isImage = url => url.match(/\.(jpeg|jpg|gif|png)$/) !== null
