#!/usr/bin/env node
import 'dotenv/config.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import os from 'node:os'

import mongo from '../lib/util/mongo.js'
import {getAuditEvents} from '../lib/models/audit.js'
import {sendMail} from '../lib/util/sendmail.js'
import {getMemberByBadgeId} from '../lib/models/member.js'
import {uidToDecimalLittleEndian} from '../lib/util/tools.js'
import {formatDate} from '../lib/dates.js'

const STATE_FILE = path.join(os.tmpdir(), 'coworking-badge-export.state')
const AUDIT_COLLECTION = 'audit'
await mongo.connect()

if (process.argv.includes('--all')) {
  try {
    await fs.unlink(STATE_FILE)
    console.log('Fichier d’état supprimé (--all)')
  } catch {}
}

console.log({STATE_FILE})

let lastRun = new Date(0)
try {
  const saved = await fs.readFile(STATE_FILE, 'utf8')
  lastRun = new Date(saved.trim())
} catch {
  console.info('Première éxécution du script')
}

console.log('Recherche des nouveaux badges depuis ' + formatDate(lastRun) + '...')

const events = await getAuditEvents({
  action: 'MEMBER_BADGE_ID_UPDATE',
  since: lastRun
})
const now = new Date()
if (events.length > 0) {
  const html = []
  const badges = []
  const relevantEvents = []

  for (const event of events) {
    const {badgeId, emailSent} = event.context
    if (emailSent || badges.includes(badgeId)) {
      continue
    }

    badges.push(badgeId)
    relevantEvents.push(event)

    const member = await getMemberByBadgeId(badgeId) // eslint-disable-line no-await-in-loop

    if (!member) {
      console.warn('Membre non trouvé pour ' + badgeId, event)
      continue
    }

    html.push(`<strong>${badgeId} / ${uidToDecimalLittleEndian(badgeId)}</strong> : ${member.firstName} ${member.lastName} (${formatDate(event.occurred)})`)
  }

  if (badges.length === 0) {
    console.warn('Aucun badge à envoyer')
  } else {
    const message = `
Bonjour,

Voici les identifiants de badges coworking envoyés depuis le ${lastRun.toLocaleString('fr-FR')} :

${'\t' + html.join('\n\t')}

Cordialement,
Coworking Metz
`

    // Envoi du mail
    await sendMail(
      {
        subject: 'Nouveaux badges membres',
        text: message
      },
      [process.env.BADGE_EMAIL_ADDRESS]
    )

    console.log('Email envoyé à', process.env.BADGE_EMAIL_ADDRESS)

    await Promise.all(
      relevantEvents.map(event =>
        mongo.db.collection(AUDIT_COLLECTION).updateOne(
          {_id: event._id},
          {$set: {'context.emailSent': now}}
        )
      )
    )
  }
}

// Sauvegarde du timestamp courant
await fs.writeFile(STATE_FILE, now.toISOString())
await mongo.disconnect()
