import createHttpError from 'http-errors'
import {Buffer} from 'node:buffer'
import crypto from 'node:crypto'
import process from 'node:process'
import zmq from 'zeromq'

const {
  PORTAPHONE_IDENTITY,
  PORTAPHONE_SKEY,
  PORTAPHONE_RELAY_IDENTITY,
  PORTAPHONE_RELAY_DOOR_INDEX,
  PORTAPHONE_ZMQ_HOST
} = process.env
const OPEN_DOOR_EVENT = 'brd_sp_open_door'
const CONNECTION_TIMEOUT_IN_MS = 5000
const SEND_EVENT_TIMEOUT_IN_MS = 5000
const RECEIVE_EVENT_TIMEOUT_IN_MS = 5000
const ACK_TIMEOUT_IN_MS = 6000

/**
 * Opens the parking barrier by sending a message to the Portaphone server via ZeroMQ.
 * @returns {Promise<{openedAt: string}>} - A promise that resolves with the timestamp when the barrier was opened.
 * @throws {Error} - Throws an error if the Portaphone service is not properly configured or if there is a timeout while waiting for acknowledgement.
 */
export async function openParkingBarrier() {
  if (!PORTAPHONE_IDENTITY
    || !PORTAPHONE_SKEY
    || !PORTAPHONE_RELAY_IDENTITY
    || !PORTAPHONE_ZMQ_HOST) {
    throw createHttpError(501, 'Portaphone service not configured')
  }

  const doorIndex = Number(PORTAPHONE_RELAY_DOOR_INDEX)
  if (Number.isNaN(doorIndex)) {
    throw createHttpError(501, 'Portaphone door index not properly configured: a number is required')
  }

  const sock = new zmq.Dealer()
  sock.routingId = PORTAPHONE_IDENTITY

  const kp = zmq.curveKeyPair()
  sock.curvePublicKey = kp.publicKey
  sock.curveSecretKey = kp.secretKey
  sock.curveServerKey = PORTAPHONE_SKEY

  sock.connectTimeout = CONNECTION_TIMEOUT_IN_MS
  sock.receiveTimeout = RECEIVE_EVENT_TIMEOUT_IN_MS
  sock.sendTimeout = SEND_EVENT_TIMEOUT_IN_MS
  sock.linger = 0

  try {
    sock.connect(PORTAPHONE_ZMQ_HOST)

    const token = crypto.randomUUID()
    const payload = JSON.stringify({
      header: {
        event: OPEN_DOOR_EVENT,
        sender: PORTAPHONE_IDENTITY,
        timestamp: Date.now()
      },
      body: {
        token,
        door: doorIndex
      }
    })
    await sock.send([Buffer.from(PORTAPHONE_RELAY_IDENTITY), Buffer.from(payload)]).catch(error => {
      throw createHttpError(502, `Échec de l'ouverture de la barrière auprès du service externe Portaphone : ${error.message}`)
    })

    let timer
    const ack = await Promise.race([
      collectAck(sock, token),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(
          createHttpError(504, `Le service externe Portaphone n'a pas accusé la réception de l'ouverture de la barrière après ${ACK_TIMEOUT_IN_MS / 1000}s d'attente.`)
        ), ACK_TIMEOUT_IN_MS)
      })
    ]).finally(() => {
      clearTimeout(timer)
    })

    const ackAt = ack.header.timestamp

    return {openedAt: new Date(ackAt).toISOString()}
  } finally {
    sock.close()
  }
}

async function collectAck(sock, token) {
  const frames = await sock.receive().catch(error => {
    if (error.code === 'EAGAIN') {
      throw createHttpError(504, `Aucune réponse du service externe Portaphone après ${RECEIVE_EVENT_TIMEOUT_IN_MS / 1000}s d'attente suite à la demande d'ouverture. Vous pouvez réessayer dans quelques instants, mais on ne vous promet rien 🤷`)
    }

    throw error
  })

  const messages = frames.map(f => {
    try {
      // The server sends back a JSON frame with the same token when the door is opened
      return JSON.parse(f.toString().trim())
    } catch (error) {
      console.warn('Unable to parse frame from Portaphone server', error)
      return null
    }
  }).filter(Boolean)

  console.debug('Received messages from Portaphone server', JSON.stringify(messages, null, 2))
  const ack = messages.find(m => m?.header?.event === `${OPEN_DOOR_EVENT}_ack` && m?.body?.token === token)
  if (ack) {
    return ack
  }

  return collectAck(sock, token)
}

