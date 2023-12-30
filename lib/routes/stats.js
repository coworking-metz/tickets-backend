import {Router} from 'express'
import Papa from 'papaparse'

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

  return app
}

const routes = await createRoutes()
export default routes
