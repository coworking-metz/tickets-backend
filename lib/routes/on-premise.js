import process from 'node:process'
import {Router} from 'express'

import w from '../util/w.js'

import {getCurrentState, getPhoneBoothsOccupation, unlockDeckDoor} from '../services/home-assistant.js'
import {add} from 'date-fns'
import createHttpError from 'http-errors'
import {logAuditTrail} from '../models/audit.js'
import {ensureAccess} from '../auth.js'

async function createRoutes() {
  const router = new Router()

  router.get('', w(async (req, res) => {
    res.send(await getCurrentState())
  }))

  router.get('/phone-booths/occupation', w(async (req, res) => {
    res.send(await getPhoneBoothsOccupation())
  }))

  router.post('/deck-door/unlock', w(ensureAccess), w(async (req, res) => {
    if (!req.user.capabilities.includes('UNLOCK_DECK_DOOR')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation de déverrouiller la porte')
    }

    logAuditTrail(req.user, 'UNLOCK_DECK_DOOR')

    await unlockDeckDoor()
    const now = new Date()
    res.send({
      triggered: now.toISOString(),
      locked: add(now, {seconds: 60}).toISOString(),
      timeout: 'PT60S'
    })
  }))

  router.get('/key-box/code/:doorName?', w(async (req, res) => {
    const doorName = (req.params.doorName || 'MAIN').toUpperCase()
    const envKey = `KEY_BOX_CODE_${doorName}`

    let code = process.env[envKey]

    if (!code && doorName === 'MAIN') {
      code = process.env.KEY_BOX_CODE
    }

    if (!code) {
      throw createHttpError(501, `Le code de la boîte à clé (${doorName}) n'est pas configuré`)
    }

    if (!req.user.capabilities.includes('KEYS_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation d\'ouvrir cette boîte à clé')
    }

    logAuditTrail(req.user, 'KEYS_ACCESS_' + doorName)

    res.send({code})
  }))

  return router
}

const routes = await createRoutes()
export default routes
