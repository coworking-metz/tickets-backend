import {sub, formatISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, isValid, isAfter} from 'date-fns'
import createError from 'http-errors'

const BEGINNING = new Date('2014-01-01')

export function parseFromTo(from, to) {
  const fromCondition = from && (from.length !== 10 || !isValid(new Date(from)))
  const toCondition = to && (to.length !== 10 || !isValid(new Date(to)))

  if (fromCondition || toCondition) {
    throw createError('Format de date non valide')
  }

  const fromDate = from ? new Date(from) : undefined
  const toDate = to ? new Date(to) : undefined

  if (fromDate && toDate && !isAfter(toDate, fromDate)) {
    throw createError('Les dates sont dans un ordre invalide')
  }

  return {from: fromDate, to: toDate}
}

export function formatDate(date) {
  return formatISO(date, {representation: 'date'})
}

export function formatRange(range) {
  return range.map(d => formatDate(d))
}

export function getLastWeekRange(date) {
  const start = sub(startOfWeek(date, {weekStartsOn: 1}), {weeks: 1})
  return formatRange([
    start,
    endOfWeek(start, {weekStartsOn: 1})
  ])
}

export function getLastMonthRange(date) {
  const start = sub(startOfMonth(date), {months: 1})
  return formatRange([
    start,
    endOfMonth(start)
  ])
}

export function getLastYearRange(date) {
  const start = sub(startOfYear(date), {years: 1})
  return formatRange([
    start,
    endOfYear(start)
  ])
}

export function getYesterdayRange(date) {
  const start = sub(date, {days: 1})
  return formatRange([
    start,
    start
  ])
}

export function getAllTimeRange(date) {
  return formatRange([
    new Date('2010-01-01'),
    date
  ])
}

export function getDays(from = BEGINNING, to = new Date()) {
  return eachDayOfInterval({start: from, end: to})
    .map(start => [formatDate(start), formatDate(start)])
}

export function getWeeks(from = BEGINNING, to = new Date()) {
  return eachWeekOfInterval({start: from, end: to}, {weekStartsOn: 1})
    .map(start => {
      const end = endOfWeek(start, {weekStartsOn: 1})
      return [formatDate(start), formatDate(end)]
    })
}

export function getMonths(from = BEGINNING, to = new Date()) {
  return eachMonthOfInterval({start: from, end: to})
    .map(start => {
      const end = endOfMonth(start)
      return [formatDate(start), formatDate(end)]
    })
}

export function getYears(from = BEGINNING, to = new Date()) {
  return eachYearOfInterval({start: from, end: to})
    .map(start => {
      const end = endOfYear(start)
      return [formatDate(start), formatDate(end)]
    })
}

const periodsBuilders = {
  day: getDays,
  week: getWeeks,
  month: getMonths,
  year: getYears
}

export function getPeriods(periodType, from, to) {
  return periodsBuilders[periodType](from, to)
}
