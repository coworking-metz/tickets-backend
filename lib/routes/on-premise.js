import process from 'node:process'
import {Router, json} from 'express'

import w from '../util/w.js'

import {AIR_CONDITIONER_ENTITY_IDS, AIR_CONDITIONER_TARGET_TEMPERATURE_RANGE, getCurrentState, getPhoneBoothsOccupation, setAirConditioningActive, setAirConditioningTargetTemperature, unlockDeckDoor} from '../services/home-assistant.js'
import {add} from 'date-fns'
import createHttpError from 'http-errors'
import {logAuditTrail} from '../models/audit.js'
import {ensureAccess, ensureAttending} from '../auth.js'

const SUPPORTED_LOCATIONS = new Set(['POULAILLER', 'PTI_POULAILLER', 'DECK', 'HUB'])

async function createRoutes() {
  const router = new Router()

  router.get('', w(async (req, res) => {
    res.send(await getCurrentState())
  }))

  router.get('/phone-booths/occupation', w(async (req, res) => {
    res.send(await getPhoneBoothsOccupation())
  }))

  router.post('/deck-door/unlock', w(ensureAccess), w(async (req, res) => {
    if (!req.user?.capabilities.includes('UNLOCK_DECK_DOOR')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation de déverrouiller la porte')
    }

    await unlockDeckDoor()

    logAuditTrail(req.user, 'UNLOCK_DECK_DOOR')

    const now = new Date()
    res.send({
      triggered: now.toISOString(),
      locked: add(now, {seconds: 60}).toISOString(),
      timeout: 'PT60S'
    })
  }))

  router.post('/air-conditioners/:id/turn-on', w(ensureAttending('poulailler')), w(async (req, res) => {
    if (!req.user?.capabilities.includes('AIR_CONDITIONING_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation de piloter la climatisation')
    }

    const {id} = req.params
    if (!AIR_CONDITIONER_ENTITY_IDS[id]) {
      throw createHttpError(400, `Air conditioner "${id}" is not supported`)
    }

    const airConditioner = await setAirConditioningActive(id, true)

    logAuditTrail(req.user, 'AIR_CONDITIONER_TURN_ON', {
      airConditioner
    })

    res.send(airConditioner)
  }))

  router.post('/air-conditioners/:id/turn-off', w(ensureAttending('poulailler')), w(async (req, res) => {
    if (!req.user?.capabilities.includes('AIR_CONDITIONING_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation de piloter la climatisation')
    }

    const {id} = req.params
    if (!AIR_CONDITIONER_ENTITY_IDS[id]) {
      throw createHttpError(400, `Air conditioner "${id}" is not supported`)
    }

    const airConditioner = await setAirConditioningActive(id, false)

    logAuditTrail(req.user, 'AIR_CONDITIONER_TURN_OFF', {
      airConditioner
    })

    res.send(airConditioner)
  }))

  router.post('/air-conditioners/:id/target-temperature', json(), w(ensureAttending('poulailler')), w(async (req, res) => {
    if (!req.user?.capabilities.includes('AIR_CONDITIONING_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation de piloter la climatisation')
    }

    const {id} = req.params
    if (!AIR_CONDITIONER_ENTITY_IDS[id]) {
      throw createHttpError(400, `Air conditioner "${id}" is not supported`)
    }

    const {temperature} = req.body
    const {min, max} = AIR_CONDITIONER_TARGET_TEMPERATURE_RANGE
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < min || temperature > max) {
      throw createHttpError(400, `La température cible doit être un nombre compris entre ${min} et ${max}`)
    }

    const airConditioner = await setAirConditioningTargetTemperature(id, temperature)

    logAuditTrail(req.user, 'AIR_CONDITIONER_SET_TARGET_TEMPERATURE', {
      airConditioner
    })

    res.send(airConditioner)
  }))

  router.get('/key-box/storage/code', w(ensureAccess), w(async (req, res) => {
    if (!req.user?.capabilities.includes('STORAGE_KEYS_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation d\'ouvrir la boîte à clé du stock')
    }

    const code = process.env.KEY_BOX_CODE_STORAGE
    if (!code) {
      throw createHttpError(501, 'Le code de la boîte à clé du stock n\'est pas configuré')
    }

    logAuditTrail(req.user, 'STORAGE_KEYS_ACCESS')

    res.send({code})
  }))

  router.get('/key-box/:location?/code', w(ensureAccess), w(async (req, res) => {
    if (!req.user?.capabilities.includes('KEYS_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation d\'ouvrir cette boîte à clé')
    }

    const location = (req.params.location || 'POULAILLER').replaceAll('-', '_').toUpperCase()
    if (!SUPPORTED_LOCATIONS.has(location)) {
      throw createHttpError(400, `La boîte à clé ${location} n'est pas supportée`)
    }

    const code = process.env[`KEY_BOX_CODE_${location}`]
    if (!code) {
      throw createHttpError(501, `Le code de la boîte à clé ${location} n'est pas configuré`)
    }

    logAuditTrail(req.user, `KEYS_ACCESS_${location}`)

    res.send({code})
  }))

  router.get('/wifi/credentials', w(ensureAccess), w(async (req, res) => {
    if (!req.user?.capabilities.includes('WIFI_CREDENTIALS_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation d\'accéder aux identifiants Wi-Fi')
    }

    const ssid = process.env.WIFI_CREDENTIALS_SSID
    const password = process.env.WIFI_CREDENTIALS_PASSWORD
    if (!ssid || !password) {
      throw createHttpError(501, 'Les identifiants Wi-Fi ne sont pas configurés')
    }

    logAuditTrail(req.user, 'WIFI_CREDENTIALS_ACCESS')

    res.send({ssid, password})
  }))

  return router
}

const routes = await createRoutes()
export default routes
