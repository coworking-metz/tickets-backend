const test = require('ava')
const request = require('supertest')
const express = require('express')
const {MongoMemoryServer} = require('mongodb-memory-server')
const mongo = require('../util/mongo')
const w = require('../util/w')
const {ping} = require('../ping')

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
