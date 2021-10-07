const {sub, formatISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval} = require('date-fns')

const BEGINNING = new Date('2014-01-01')

function formatDate(date) {
  return formatISO(date, {representation: 'date'})
}

function formatRange(range) {
  return range.map(d => formatDate(d))
}

function getLastWeekRange(date) {
  const start = sub(startOfWeek(date, {weekStartsOn: 1}), {weeks: 1})
  return formatRange([
    start,
    endOfWeek(start, {weekStartsOn: 1})
  ])
}

function getLastMonthRange(date) {
  const start = sub(startOfMonth(date), {months: 1})
  return formatRange([
    start,
    endOfMonth(start)
  ])
}

function getLastYearRange(date) {
  const start = sub(startOfYear(date), {years: 1})
  return formatRange([
    start,
    endOfYear(start)
  ])
}

function getYesterdayRange(date) {
  const start = sub(date, {days: 1})
  return formatRange([
    start,
    start
  ])
}

function getAllTimeRange(date) {
  return formatRange([
    new Date('2010-01-01'),
    date
  ])
}

function getDays(from = BEGINNING, to = new Date()) {
  return eachDayOfInterval({start: from, end: to})
    .map(start => [formatDate(start), formatDate(start)])
}

function getWeeks(from = BEGINNING, to = new Date()) {
  return eachWeekOfInterval({start: from, end: to}, {weekStartsOn: 1})
    .map(start => {
      const end = endOfWeek(start, {weekStartsOn: 1})
      return [formatDate(start), formatDate(end)]
    })
}

function getMonths(from = BEGINNING, to = new Date()) {
  return eachMonthOfInterval({start: from, end: to})
    .map(start => {
      const end = endOfMonth(start)
      return [formatDate(start), formatDate(end)]
    })
}

function getYears(from = BEGINNING, to = new Date()) {
  return eachYearOfInterval({start: from, end: to})
    .map(start => {
      const end = endOfYear(start)
      return [formatDate(start), formatDate(end)]
    })
}

module.exports = {getDays, getWeeks, getMonths, getYears, getYesterdayRange, getLastWeekRange, getLastMonthRange, getLastYearRange, getAllTimeRange, formatDate}
