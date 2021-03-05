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

function getDays() {
  return eachDayOfInterval({start: BEGINNING, end: new Date()})
    .map(start => {
      return [formatDate(start), formatDate(start)]
    })
}

function getWeeks() {
  return eachWeekOfInterval({start: BEGINNING, end: new Date()}, {weekStartsOn: 1})
    .map(start => {
      const end = endOfWeek(start, {weekStartsOn: 1})
      return [formatDate(start), formatDate(end)]
    })
}

function getMonths() {
  return eachMonthOfInterval({start: BEGINNING, end: new Date()})
    .map(start => {
      const end = endOfMonth(start)
      return [formatDate(start), formatDate(end)]
    })
}

function getYears() {
  return eachYearOfInterval({start: BEGINNING, end: new Date()})
    .map(start => {
      const end = endOfYear(start)
      return [formatDate(start), formatDate(end)]
    })
}

module.exports = {getDays, getWeeks, getMonths, getYears, getYesterdayRange, getLastWeekRange, getLastMonthRange, getLastYearRange, getAllTimeRange}
