import test from 'ava'
import request from 'supertest'
import express from 'express'
import {MongoMemoryServer} from 'mongodb-memory-server'

import mongo from '../util/mongo.js'
import w from '../util/w.js'
import {ping} from '../ping.js'

/* MongoDB testing stuff */

let mongod

async function cleanMongoContext() {
  if (mongo.client) {
    await mongo.disconnect(true)
  }

  if (mongod) {
    await mongod.stop()
  }
}

async function initMongoContext() {
  await cleanMongoContext()

  mongod = await MongoMemoryServer.create()
  await mongo.connect(mongod.getUri())
}

test.before('start server', initMongoContext)
test.after.always('cleanup', cleanMongoContext)

/* End of MongoDB testing stuff */

function getPingServer() {
  const server = express()
  server.get('/ping', w(ping))
  return server
}

test.serial('ping / ok', async t => {
  const server = getPingServer()
  const response = await request(server).get('/ping')

  t.is(response.status, 200)
  t.deepEqual(response.body, {status: 'up'})
})

test.serial('ping / ko', async t => {
  const server = getPingServer()
  await cleanMongoContext() // Breaking MongoDB server

  const response = await request(server).get('/ping')

  t.is(response.status, 200)
  t.deepEqual(response.body, {status: 'down'})

  await initMongoContext() // Repair things
})
