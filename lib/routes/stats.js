import process from 'node:process'

import {Router} from 'express'
import Papa from 'papaparse'

import w from '../util/w.js'

import {parseFromTo} from '../dates.js'
import {computeIncomes} from '../models.js'
import {computeStats, computePeriodsStats, asCsv} from '../stats.js'

const PERIODS_TYPES = new Set(['day', 'week', 'month', 'year'])

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

// Précalcul des données
if (process.env.PRECOMPUTE_STATS === '1') {
  await Promise.all([...PERIODS_TYPES].map(periodType => computePeriodsStats(periodType)))
}
