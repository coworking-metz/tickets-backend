import {Router} from 'express'

import w from '../util/w.js'

import {getCurrentState, getPhoneBoothsOccupation, unlockDeckDoor} from '../services/home-assistant.js'
import {add} from 'date-fns'
import createHttpError from 'http-errors'

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
    console.log(`${req.user?.email || 'Someone'} is unlocking deck door`)

    await unlockDeckDoor()
    const now = new Date()
    res.send({
      triggered: now.toISOString(),
      locked: add(now, {seconds: 60}).toISOString(),
      timeout: 'PT60S' // Didn't count yet but I suspect a 60 seconds period
    })
  }))

  return router
}

const routes = await createRoutes()
export default routes
