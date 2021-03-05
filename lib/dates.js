const {sub, formatISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear} = require('date-fns')

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

module.exports = {getYesterdayRange, getLastWeekRange, getLastMonthRange, getLastYearRange, getAllTimeRange}
