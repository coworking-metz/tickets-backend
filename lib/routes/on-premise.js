import process from 'node:process'
import {Router} from 'express'

import w from '../util/w.js'

import {getCurrentState, getPhoneBoothsOccupation, unlockDeckDoor} from '../services/home-assistant.js'
import {add} from 'date-fns'
import createHttpError from 'http-errors'
import {logAuditTrail} from '../models/audit.js'

async function createRoutes() {
  const router = new Router()

  router.get('', w(async (req, res) => {
    res.send(await getCurrentState())
  }))

  router.get('/phone-booths/occupation', w(async (req, res) => {
    res.send(await getPhoneBoothsOccupation())
  }))

  router.post('/deck-door/unlock', w(async (req, res) => {
    if (!req.user.capabilities.includes('UNLOCK_DECK_DOOR')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation de déverrouiller la porte')
    }

    // At least log who is unlocking the door
    logAuditTrail(req.user, 'UNLOCK_DECK_DOOR')

    await unlockDeckDoor()
    const now = new Date()
    res.send({
      triggered: now.toISOString(),
      locked: add(now, {seconds: 60}).toISOString(),
      timeout: 'PT60S'
    })
  }))

  router.get('/key-box/code', w(async (req, res) => {
    if (!process.env.KEY_BOX_CODE) {
      throw createHttpError(501, 'Le code de la boîte à clé n\'est pas configuré')
    }

    if (!req.user.capabilities.includes('KEYS_ACCESS')) {
      throw createHttpError(403, 'Vous n\'avez pas l\'autorisation d\'ouvrir la boîte à clé')
    }

    // At least log who is opening key box
    logAuditTrail(req.user, 'KEYS_ACCESS')

    res.send({
      code: process.env.KEY_BOX_CODE
    })
  }))

  return router
}

const routes = await createRoutes()
export default routes
