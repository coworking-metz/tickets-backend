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

const sendAll = Boolean(process.argv.includes('--all'))

if (sendAll) {
  try {
    await fs.unlink(STATE_FILE)
    console.log('Fichier d’état supprimé (--all)')
  } catch {}
}

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
// ... reste du script identique au début

if (events.length > 0) {
  const html = []
  const badges = []
  const relevantEvents = []
  const csvRows = [['badgeId', 'decimalId', 'firstName', 'lastName', 'date']]

  for (const event of events) {
    const {badgeId, emailSent} = event.context
    if (emailSent && !sendAll) {
      continue
    }

    if (badges.includes(badgeId)) {
      continue
    }

    badges.push(badgeId)
    relevantEvents.push(event)

    const member = await getMemberByBadgeId(badgeId) // eslint-disable-line no-await-in-loop

    if (!member) {
      console.warn('Membre non trouvé pour ' + badgeId, event)
      continue
    }

    const decimalId = uidToDecimalLittleEndian(badgeId)
    const formattedDate = formatDate(event.occurred)

    html.push(`<strong>${badgeId} / ${decimalId}</strong> : ${member.firstName} ${member.lastName} (${formattedDate})`)
    csvRows.push([badgeId, decimalId, member.firstName, member.lastName, formattedDate])
  }

  if (badges.length === 0) {
    console.warn('Aucun badge à envoyer')
  } else {
    const message = `
Bonjour,

Voici les identifiants de badges coworking envoyés depuis le ${lastRun.toLocaleString('fr-FR')} en pièce jointe

Cordialement,
Coworking Metz
`

    // Génération du CSV
    const csvContent = csvRows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n')

    // Envoi du mail avec pièce jointe
    await sendMail(
      {
        subject: 'Nouveaux badges membres',
        text: message,
        attachments: [
          {
            filename: `badges-${now.toISOString().slice(0, 10)}.csv`,
            content: csvContent,
            contentType: 'text/csv'
          }
        ]
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
