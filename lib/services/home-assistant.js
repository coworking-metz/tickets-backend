import process from 'node:process'
import got from 'got'
import createError from 'http-errors'
import {add, differenceInMinutes, endOfHour, startOfHour, sub} from 'date-fns'

const {HOME_ASSISTANT_BASE_URL, HOME_ASSISTANT_LONG_LIVED_TOKEN} = process.env

const BLUE_PHONE_BOOTH_ID = 'binary_sensor.blue_telephone_booth_occupied'
const ORANGE_PHONE_BOOTH_ID = 'binary_sensor.orange_telephone_booth_occupied'
const DECK_DOOR_ID = 'lock.porte_de_la_terrasse'
const BIG_NETATMO_STATION_ID = 'sensor.netatmo_station_big'
const SMALL_NETATMO_STATION_ID = 'sensor.netatmo_station_small'
const FLEXISPOT_A_OCCUPANCY_ID = 'binary_sensor.flexispot_a_occupied'
const FLEXISPOT_B_OCCUPANCY_ID = 'binary_sensor.flexispot_b_occupied'

export const getCurrentState = async () => {
  const entities = await getEntitiesState(new Set([
    BLUE_PHONE_BOOTH_ID,
    ORANGE_PHONE_BOOTH_ID,
    DECK_DOOR_ID,
    FLEXISPOT_A_OCCUPANCY_ID,
    FLEXISPOT_B_OCCUPANCY_ID,
    `${BIG_NETATMO_STATION_ID}_co2`,
    `${BIG_NETATMO_STATION_ID}_humidity`,
    `${BIG_NETATMO_STATION_ID}_noise`,
    `${BIG_NETATMO_STATION_ID}_pressure`,
    `${BIG_NETATMO_STATION_ID}_temperature`,
    `${SMALL_NETATMO_STATION_ID}_humidity`,
    `${SMALL_NETATMO_STATION_ID}_temperature`
  ]))

  const bluePhoneBooth = entities.find(({entity_id}) => entity_id === BLUE_PHONE_BOOTH_ID)
  const orangePhoneBooth = entities.find(({entity_id}) => entity_id === ORANGE_PHONE_BOOTH_ID)
  const deckDoor = entities.find(({entity_id}) => entity_id === DECK_DOOR_ID)
  const flexispotAOccupancy = entities.find(({entity_id}) => entity_id === FLEXISPOT_A_OCCUPANCY_ID)
  const flexispotBOccupancy = entities.find(({entity_id}) => entity_id === FLEXISPOT_B_OCCUPANCY_ID)
  const poulaillerCarbonDioxide = entities.find(({entity_id}) => entity_id === `${BIG_NETATMO_STATION_ID}_co2`)
  const poulaillerHumidity = entities.find(({entity_id}) => entity_id === `${BIG_NETATMO_STATION_ID}_humidity`)
  const poulaillerNoise = entities.find(({entity_id}) => entity_id === `${BIG_NETATMO_STATION_ID}_noise`)
  const poulaillerPressure = entities.find(({entity_id}) => entity_id === `${BIG_NETATMO_STATION_ID}_pressure`)
  const poulaillerTemperature = entities.find(({entity_id}) => entity_id === `${BIG_NETATMO_STATION_ID}_temperature`)
  const ptiPoulaillerHumidity = entities.find(({entity_id}) => entity_id === `${SMALL_NETATMO_STATION_ID}_humidity`)
  const ptiPoulaillerTemperature = entities.find(({entity_id}) => entity_id === `${SMALL_NETATMO_STATION_ID}_temperature`)

  return {
    deckDoor: {
      unlocked: deckDoor?.state === 'unlocked'
    },
    phoneBooths: {
      blue: {
        occupied: bluePhoneBooth?.state === 'on'
      },
      orange: {
        occupied: orangePhoneBooth?.state === 'on'
      }
    },
    flexDesks: {
      a: {
        occupied: flexispotAOccupancy?.state === 'on'
      },
      b: {
        occupied: flexispotBOccupancy?.state === 'on'
      }
    },
    sensors: {
      carbonDioxide: {
        level: Number(poulaillerCarbonDioxide?.state)
      },
      humidity: {
        level: Number(poulaillerHumidity?.state),
        ptiPoulaillerLevel: Number(ptiPoulaillerHumidity?.state)
      },
      noise: {
        level: Number(poulaillerNoise?.state)
      },
      pressure: {
        level: Number(poulaillerPressure?.state)
      },
      temperature: {
        level: Number(poulaillerTemperature?.state),
        ptiPoulaillerLevel: Number(ptiPoulaillerTemperature?.state)
      }
    }
  }
}

export const getOpenSpaceSensorsHistory = async () => {
  if (!HOME_ASSISTANT_BASE_URL || !HOME_ASSISTANT_LONG_LIVED_TOKEN) {
    throw createError(501, 'Home Assistant service not configured')
  }

  const sensors = [
    `${BIG_NETATMO_STATION_ID}_co2`,
    `${BIG_NETATMO_STATION_ID}_humidity`,
    `${BIG_NETATMO_STATION_ID}_noise`,
    `${BIG_NETATMO_STATION_ID}_pressure`,
    `${BIG_NETATMO_STATION_ID}_temperature`
  ]
  const last10Minutes = sub(new Date(), {minutes: 10})

  const history = await got.get(`api/history/period/${last10Minutes.toISOString()}`, {
    prefixUrl: HOME_ASSISTANT_BASE_URL,
    timeout: {
      request: 10_000 // 10 seconds
    },
    headers: {
      authorization: `Bearer ${HOME_ASSISTANT_LONG_LIVED_TOKEN}`
    },
    searchParams: {
      filter_entity_id: sensors.join(','),
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: true
    }
  }).json()

  const [co2History, humidityHistory, noiseHistory, pressureHistory, temperatureHistory] = history
  const [mostRecentCO2] = co2History.slice(-1)
  const [mostRecentHumidity] = humidityHistory.slice(-1)
  const [mostRecentNoise] = noiseHistory.slice(-1)
  const [mostRecentPressure] = pressureHistory.slice(-1)
  const [mostRecentTemperature] = temperatureHistory.slice(-1)

  return {
    co2: mostRecentCO2,
    humidity: mostRecentHumidity,
    noise: mostRecentNoise,
    pressure: mostRecentPressure,
    temperature: mostRecentTemperature
  }
}

/**
 * Format as Netatmo schema
 * @see https://dev.netatmo.com/apidocumentation/weather#getstationsdata
 */
export const getOpenSpaceSensorsFormattedAsNetatmo = async () => {
  const sensors = await getOpenSpaceSensorsHistory()

  return [
    {
      dashboard_data: {
        time: Number.parseInt(new Date(sensors.co2.last_changed).getTime() / 1000, 10),
        CO2: Number(sensors.co2.state),
        Temperature: Number(sensors.temperature.state),
        Noise: Number(sensors.noise.state),
        Humidity: Number(sensors.humidity.state),
        Pressure: Number(sensors.pressure.state)
      }
    }
  ]
}

export const pressIntercomButton = async () => {
  if (!HOME_ASSISTANT_BASE_URL || !HOME_ASSISTANT_LONG_LIVED_TOKEN) {
    throw createError(501, 'Home Assistant service not configured')
  }

  const [changedState] = await got.post('api/services/button/press', {
    prefixUrl: HOME_ASSISTANT_BASE_URL,
    timeout: {
      request: 10_000 // 10 seconds
    },
    headers: {
      authorization: `Bearer ${HOME_ASSISTANT_LONG_LIVED_TOKEN}`
    },
    json: {
      entity_id: 'button.intercom_unlock_door'
    }
  }).json()

  if (!changedState) {
    throw createError(503, 'Le dispositif de déverouillage de la porte ne répond pas. Vous pouvez réessayer dans quelques instants. Si le problème persiste, contactez-nous.')
  }

  return changedState
}

export const getPhoneBoothsOccupation = async () => {
  if (!HOME_ASSISTANT_BASE_URL || !HOME_ASSISTANT_LONG_LIVED_TOKEN) {
    throw createError(501, 'Home Assistant service not configured')
  }

  const sensors = [BLUE_PHONE_BOOTH_ID, ORANGE_PHONE_BOOTH_ID]
  const since = sub(new Date(), {years: 1})

  const history = await got.get(`api/history/period/${since.toISOString()}`, {
    prefixUrl: HOME_ASSISTANT_BASE_URL,
    timeout: {
      request: 10_000 // 10 seconds
    },
    headers: {
      authorization: `Bearer ${HOME_ASSISTANT_LONG_LIVED_TOKEN}`
    },
    searchParams: {
      filter_entity_id: sensors.join(','),
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: true,
      end_time: new Date().toISOString()
    }
  }).json()

  const [bluePhoneBoothHistory, orangePhoneBoothHistory] = history

  return {
    blue: {
      occupation: computeAverageOccupationInMinutes(bluePhoneBoothHistory)
    },
    orange: {
      occupation: computeAverageOccupationInMinutes(orangePhoneBoothHistory)
    }
  }
}

export const unlockDeckDoor = async () => {
  if (!HOME_ASSISTANT_BASE_URL || !HOME_ASSISTANT_LONG_LIVED_TOKEN) {
    throw createError(501, 'Home Assistant service not configured')
  }

  const [changedState] = await got.post('api/services/lock/unlock', {
    prefixUrl: HOME_ASSISTANT_BASE_URL,
    timeout: {
      request: 10_000 // 10 seconds
    },
    headers: {
      authorization: `Bearer ${HOME_ASSISTANT_LONG_LIVED_TOKEN}`
    },
    json: {
      entity_id: DECK_DOOR_ID
    }
  }).json()

  if (!changedState) {
    throw createError(503, 'Le déverrouillage de la porte de la terrasse a échoué.')
  }

  return changedState
}

export const notifyOnSignal = message => {
  if (!HOME_ASSISTANT_BASE_URL || !HOME_ASSISTANT_LONG_LIVED_TOKEN) {
    throw createError(501, 'Home Assistant service not configured')
  }

  return got.post('api/services/notify/signal', {
    prefixUrl: HOME_ASSISTANT_BASE_URL,
    timeout: {
      request: 60_000 // 60 seconds
    },
    headers: {
      authorization: `Bearer ${HOME_ASSISTANT_LONG_LIVED_TOKEN}`
    },
    json: {
      message
    }
  })
}

/**
 * Map array of "on" and "off" states
 * to an array of periods with start and end properties
 *
 * @param {Array<{state: 'on' | 'off', last_changed: string}>} history
 * @returns {Array<{start: Date, end: Date}>}
 */
const mapToPeriods = history => {
  const periods = []
  let start = null
  for (const state of history) {
    if (state.state === 'on' && start === null) {
      start = new Date(state.last_changed)
    } else if (state.state === 'off' && start !== null) {
      periods.push({
        start,
        end: new Date(state.last_changed)
      })
      start = null
    }
  }

  return periods
}

/**
 * Group periods by date
 *
 * @param {Array<{start: Date, end: Date}>} periods
 * @returns { [date: string]: Array<{start: Date, end: Date}> }
 */
const groupPeriodsByDate = periods => {
  const periodsByDate = {}
  for (const period of periods) {
    const date = period.start.toISOString().slice(0, 10)
    periodsByDate[date] = [...(periodsByDate[date] || []), period]
  }

  return periodsByDate
}

/**
 * Compute the number of minutes for each hour
 * given multiple periods
 *
 * @param {Array<{start: Date, end: Date}>} periods
 * @returns {
 *  [hour: number]: number
 * }
 */
const computeMinutesPerHour = periods => {
  const minutesByHour = {}
  for (const period of periods) {
    let {start} = period
    let end = period.end > endOfHour(period.start) ? endOfHour(period.start) : period.end

    while (end <= period.end) {
      const diff = differenceInMinutes(end, start)
      const hour = startOfHour(start).getUTCHours()
      minutesByHour[hour] = (minutesByHour[hour] || 0) + diff
      if (hour === end.getUTCHours()) {
        break
      }

      start = add(hour, {hours: 1})
      end = endOfHour(start) > period.end ? period.end : endOfHour(start)
    }
  }

  return minutesByHour
}

/**
 * Compute the number of minutes for each hour
 * for each date
 *
 * @param {Object.<string, Array<{start: Date, end: Date}>} periodsByDate
 * @returns {Object.<string, {[hour: number]: number}>}
 */
const computeMinutesPerHourByDate = periodsByDate =>
  // Retrieve the number of minutes per hour for each date
  Object.fromEntries(Object.entries(periodsByDate).map(([date, periods]) => [date, computeMinutesPerHour(periods)]))

/**
 * Compute the average number of minutes for each hour
 * for each week day
 *
 * @param {Object.<string, {[hour: number]: number}>} minutesByHourByDates
 * @returns {Array<{weekDayIndex: number, averageMinutesByUTCHour: {[hour: number]: number}}>}
 */
const computeAverageMinutePerHourAndGroupByWeekDay = minutesByHourByDates => Array.from({length: 7}, (_, i) => i).map(i => {
  const datesWithSameWeekDay = Object.entries(minutesByHourByDates).filter(([date]) => new Date(date).getUTCDay() === i).map(([date, minutesByHour]) => ({
    date, minutesByHour
  }))

  // Compute average of minutes per hour for this week day
  // eslint-disable-next-line unicorn/no-array-reduce
  const totalMinutesByHour = datesWithSameWeekDay.reduce((acc, {minutesByHour}) => {
    for (const [hour, minutes] of Object.entries(minutesByHour)) {
      acc[hour] = (acc[hour] || 0) + minutes
    }

    return acc
  }, {})

  const numberOfDates = datesWithSameWeekDay.length
  const averageMinutesByUTCHour = Object.fromEntries(Object.entries(totalMinutesByHour).map(([hour, minutes]) => [hour, minutes / numberOfDates]))
  return {
    weekDayIndex: i,
    averageMinutesByUTCHour
  }
})

const computeAverageOccupationInMinutes = (history = []) => {
  const periods = mapToPeriods(history)
  const periodsByDate = groupPeriodsByDate(periods)
  const minutesByHourByDates = computeMinutesPerHourByDate(periodsByDate)
  return computeAverageMinutePerHourAndGroupByWeekDay(minutesByHourByDates)
}

/**
 * Fetch the state of the given entities
 *
 * @param {Array<string>} entities
 * @returns {Promise<Array<{entity_id: string, state: string, last_changed: string}>>}
 */
const getEntitiesState = async entities => {
  if (!HOME_ASSISTANT_BASE_URL || !HOME_ASSISTANT_LONG_LIVED_TOKEN) {
    throw createError(501, 'Home Assistant service not configured')
  }

  const states = await got.get('api/states', {
    prefixUrl: HOME_ASSISTANT_BASE_URL,
    timeout: {
      request: 10_000 // 10 seconds
    },
    headers: {
      authorization: `Bearer ${HOME_ASSISTANT_LONG_LIVED_TOKEN}`
    }
  }).json()

  return states.filter(entity => entities.has(entity.entity_id))
}
