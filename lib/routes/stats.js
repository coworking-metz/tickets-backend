import pMap from 'p-map'
import {Router} from 'express'
import Papa from 'papaparse'
import * as Activity from '../models/activity.js'
import * as Member from '../models/member.js'

import w from '../util/w.js'

import {parseFromTo} from '../dates.js'

import {
  computeIncomes,
  computeStats,
  computePeriodsStats,
  asCsv,
  PERIODS_TYPES
} from '../stats.js'

async function createRoutes() {
  const app = new Router()

  app.get('', w(async (req, res) => {
    const stats = await computeStats()
    res.send(stats)
  }))

  app.get('/:periodType', w(async (req, res) => {
    const {periodType} = req.params

    if (!PERIODS_TYPES.has(periodType)) {
      return res.sendStatus(404)
    }

    const {from, to} = parseFromTo(req.query.from, req.query.to)

    const stats = await computePeriodsStats(periodType, {
      includesCurrent: req.query.includesCurrent === '1',
      from,
      to
    })

    if (req.query.format === 'csv') {
      return res.type('text/csv').send(
        Papa.unparse(stats.map(s => asCsv(s)))
      )
    }

    res.send(stats)
  }))

  app.get('/incomes/:periodType', w(async (req, res) => {
    const {periodType} = req.params

    if (!PERIODS_TYPES.has(periodType)) {
      return res.sendStatus(404)
    }

    const {from, to} = parseFromTo(req.query.from, req.query.to)

    const stats = await computeIncomes(periodType, from, to)

    if (req.query.format === 'csv') {
      return res.type('text/csv').send(
        Papa.unparse(stats.map(s => ({
          date: s.date,
          type: s.type,
          used_tickets: s.data.usedTickets,
          days_abos: s.data.daysAbo,
          incomes: s.data.incomes
        })))
      )
    }

    res.send(stats)
  }))

  app.get('/presences/month/:year/:month', w(async (req, res) => {
    const {year, month} = req.params

    const users = await Member.getAllUsers()

    const stats = []
    const allDates = new Set() // To track all unique dates

    await pMap(users, async user => {
      const userStats = {user: user.email, presences: 0, dates: {}}
      const memberActivity = await Activity.getMemberActivity(user._id)

      for (const activityEntry of memberActivity) {
        const {date, value} = activityEntry
        if (!date.includes(year + '-' + month)) {
          continue
        }

        userStats.presences += value
        userStats.dates[date] = value
        allDates.add(date) // Add date to the set of unique dates
      }

      stats.push(userStats)
    })
    if (req.query.sort === 'user') {
      stats.sort((a, b) => a.user.localeCompare(b.user))
    } else {
      stats.sort((a, b) => b.presences - a.presences)
    }

    const filtered = stats.filter(item => Object.keys(item.dates).length > 0)

    if (req.query.format === 'csv') {
      // Convert the Set of dates into an array and sort them
      const sortedDates = [...allDates].sort()

      return res.type('text/csv').send(
        Papa.unparse(filtered.map(s => {
          // Create the CSV row for each user, adding presences and each date's value
          const row = {
            email: s.user,
            presences: s.presences
          }

          // Add all the dates (even if the user doesn't have a value for some dates)
          for (const date of sortedDates) {
            row[date] = s.dates[date] || 0 // Default to 0 if no presence on that date
          }

          return row
        }), {
          columns: ['email', 'presences', ...sortedDates] // Define the columns for CSV
        })
      )
    }

    res.send(filtered)
  }))

  return app
}

const routes = await createRoutes()
export default routes
