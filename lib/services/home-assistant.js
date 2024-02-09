import process from 'node:process'
import got from 'got'
import createError from 'http-errors'
import {sub} from 'date-fns'

const {HOME_ASSISTANT_BASE_URL, HOME_ASSISTANT_LONG_LIVED_TOKEN} = process.env

export const getOpenSpaceSensors = async () => {
  if (!HOME_ASSISTANT_BASE_URL || !HOME_ASSISTANT_LONG_LIVED_TOKEN) {
    throw createError(501, 'Home Assistant service not configured')
  }

  const sensors = [
    'sensor.interieur_co2',
    'sensor.interieur_humidity',
    'sensor.interieur_noise',
    'sensor.interieur_pressure',
    'sensor.interieur_temperature'
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
  const sensors = await getOpenSpaceSensors()

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
    throw createError(503, 'Le déverouillage de la porte a échoué.')
  }

  return changedState
}
