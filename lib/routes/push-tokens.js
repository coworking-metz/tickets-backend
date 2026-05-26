import {Router, json} from 'express'
import createHttpError from 'http-errors'

import w from '../util/w.js'
import * as PushToken from '../models/push-token.js'

const VALID_PLATFORMS = new Set(['ios', 'android'])

async function createRoutes() {
  const router = new Router()

  router.post('', json(), w(async (req, res) => {
    const memberId = req.rawUser._id
    const {token, platform} = req.body

    if (!token || !token.startsWith('ExponentPushToken[')) {
      throw createHttpError(400, 'token doit être un ExponentPushToken valide')
    }

    if (!platform || !VALID_PLATFORMS.has(platform)) {
      throw createHttpError(400, 'platform doit être "ios" ou "android"')
    }

    const pushToken = await PushToken.upsertPushToken(memberId, token, platform)
    res.send(pushToken)
  }))

  router.delete('', json(), w(async (req, res) => {
    const memberId = req.rawUser._id
    const {token} = req.body

    if (!token || !token.startsWith('ExponentPushToken[')) {
      throw createHttpError(400, 'token doit être un ExponentPushToken valide')
    }

    await PushToken.deletePushToken(memberId, token)
    res.sendStatus(204)
  }))

  return router
}

export default await createRoutes()
