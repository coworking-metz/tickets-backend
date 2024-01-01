import {chain} from 'lodash-es'
import createHttpError from 'http-errors'
import mongo from '../util/mongo.js'

import * as Member from './member.js'

export async function assignMacAddressesToMember(memberId, macAddresses) {
  const cleanedMacAddresses = checkMacAddresseList(macAddresses)

  // We remove all devices from this member that are not in the list
  await mongo.db.collection('devices').updateMany(
    {member: memberId, macAddress: {$nin: cleanedMacAddresses}},
    {$set: {member: null}}
  )

  // We update or add all devices from the list
  await Promise.all(cleanedMacAddresses.map(async macAddress => {
    await mongo.db.collection('devices').updateOne(
      {macAddress},
      {$set: {member: memberId}},
      {upsert: true}
    )
  }))

  return getMacAddressesOfMember(memberId)
}

export async function getMacAddressesOfMember(memberId) {
  return mongo.db.collection('devices').distinct('macAddress', {member: memberId})
}

export async function getAssignedDevices() {
  return mongo.db.collection('devices').find({member: {$ne: null}}).toArray()
}

export async function heartbeatDevicesByMacAddresses(macAddresses) {
  const now = new Date()
  const cleanedMacAddresses = checkMacAddresseList(macAddresses)

  await mongo.db.collection('devices').updateMany(
    {macAddress: {$in: cleanedMacAddresses}},
    {$set: {heartbeat: now}}
  )

  const memberIds = await mongo.db.collection('devices').distinct('member', {
    macAddress: {$in: cleanedMacAddresses}
  })

  await Member.heartbeatMembers(memberIds, now)
}

function isMacAddress(value) {
  return /^([\da-f]{2}:){5}([\da-f]{2})$/.test(value)
}

function checkMacAddresseList(macAddresses) {
  if (!Array.isArray(macAddresses) || macAddresses.some(macAddress => typeof macAddress !== 'string')) {
    throw createHttpError(400, 'macAddresses must be an array of strings')
  }

  const cleanedMacAddresses = chain(macAddresses)
    .map(macAddress => macAddress.trim().toUpperCase())
    .uniq()
    .value()

  if (cleanedMacAddresses.some(macAddress => !isMacAddress(macAddress))) {
    throw createHttpError(400, 'Invalid MAC address')
  }

  return cleanedMacAddresses
}
