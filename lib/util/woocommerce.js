import process from 'node:process'
import {createHmac} from 'node:crypto'

import express from 'express'

const {WP_WC_WEBHOOK_SECRET} = process.env

if (!WP_WC_WEBHOOK_SECRET) {
  console.log('Warning: WP_WC_WEBHOOK_SECRET is not set, webhooks will not be validated.')
}

export const validateAndParseJson = express.json({
  verify(req, res, buf) {
    const computedSignature = createHmac('sha256', WP_WC_WEBHOOK_SECRET)
      .update(buf, 'utf8')
      .digest('base64')
    if (req.get('x-wc-webhook-signature') !== computedSignature) {
      if (process.env.IGNORE_SIGNATURE_MISSMATCH) {
        return
      }

      throw new Error('Webhook signature mismatch')
    }
  }
})
