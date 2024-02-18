import {Router} from 'express'

import w from '../util/w.js'

import {multiAuth} from '../auth.js'
import {getCurrentState, getPhoneBoothsOccupation} from '../services/home-assistant.js'

async function createRoutes() {
  const router = new Router()

  router.get('', w(async (req, res) => {
    res.send(await getCurrentState())
  }))

  router.get('/phone-booths/occupation', w(multiAuth), w(async (req, res) => {
    res.send(await getPhoneBoothsOccupation())
  }))

  return router
}

const routes = await createRoutes()
export default routes
