import {chain} from 'lodash-es'
import createHttpError from 'http-errors'
import mongo from '../util/mongo.js'

import * as Member from './member.js'
import {isMacAddress} from '../util/tools.js'
import {differenceInMinutes} from 'date-fns'
import {ObjectId} from 'mongodb'

export const LAST_SEEN_DELAY_IN_MIN = 10 // Since when a device is marked as attending a location, in minutes

export async function assignMacAddressesToMember(memberId, macAddresses) {
  const cleanedMacAddresses = checkMacAddresseList(macAddresses)

  // We check that all devices are not already assigned to another member
  const alreadyAssignedDevices = await mongo.db.collection('devices').find({
    member: {$nin: [memberId, null]},
    macAddress: {$in: cleanedMacAddresses}
  }).toArray()

  if (alreadyAssignedDevices.length > 0) {
    const errorMessage = alreadyAssignedDevices.length === 1
      ? `${alreadyAssignedDevices[0].macAddress} is already assigned to member ${alreadyAssignedDevices[0].member}`
      : `These devices are already assigned: ${alreadyAssignedDevices.map(device => `${device.macAddress} to ${device.member}`).join(', ')}`
    throw createHttpError(409, errorMessage)
  }

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

export async function getMemberDevices(memberId) {
  const devices = await mongo.db.collection('devices').find({member: memberId})
    .sort({heartbeat: -1})
    .toArray()
  return devices.map(d => formatDevice(d))
}

export async function getMacAddressesOfMember(memberId) {
  return mongo.db.collection('devices').distinct('macAddress', {member: memberId})
}

export async function getAssignedDevices() {
  return mongo.db.collection('devices').find({member: {$ne: null}}).toArray()
}

export async function heartbeatDevicesByMacAddresses(macAddresses, location = null) {
  const now = new Date()
  const cleanedMacAddresses = checkMacAddresseList(macAddresses)

  const set = {heartbeat: now}
  if (location) {
    set.location = location
  }

  await mongo.db.collection('devices').updateMany(
    {macAddress: {$in: cleanedMacAddresses}},
    {$set: set}
  )

  const memberIds = await mongo.db.collection('devices').distinct('member', {
    macAddress: {$in: cleanedMacAddresses}
  })

  await Member.heartbeatMembers(memberIds, now, location)
}

function checkMacAddresseList(macAddresses) {
  if (!Array.isArray(macAddresses) || macAddresses.some(macAddress => typeof macAddress !== 'string')) {
    throw createHttpError(400, 'macAddresses must be an array of strings')
  }

  const cleanedMacAddresses = chain(macAddresses)
    .map(macAddress => macAddress.trim().toUpperCase())
    .uniq()
    .value()

  const invalidMacAddress = cleanedMacAddresses.find(macAddress => !isMacAddress(macAddress))

  if (invalidMacAddress) {
    throw createHttpError(400, `Adresse MAC invalide : ${invalidMacAddress}`)
  }

  return cleanedMacAddresses
}

export async function getMemberDevice(memberId, deviceId) {
  const device = await mongo.db.collection('devices').findOne({
    _id: new ObjectId(deviceId),
    member: memberId
  })

  if (!device) {
    throw createHttpError(404, `Appareil ${deviceId} introuvable pour le membre ${memberId}`)
  }

  return formatDevice(device)
}

export async function pairMemberDevice(memberId, macAddress, name, type = 'UNKNOWN') {
  const formattedMacAddress = macAddress.trim().toUpperCase()
  if (!isMacAddress(formattedMacAddress)) {
    throw createHttpError(400, `Adresse MAC invalide : ${formattedMacAddress}`)
  }

  // We check that the device is not already assigned to another member
  const alreadyAssignedDevice = await mongo.db.collection('devices').findOne({
    member: {$nin: [memberId, null]},
    macAddress: formattedMacAddress
  })

  if (alreadyAssignedDevice) {
    throw createHttpError(409, `L'appareil ${alreadyAssignedDevice.macAddress} est déjà associé à quelqu'un d'autre`)
  }

  const updatedDeviceDocument = await mongo.db.collection('devices').findOneAndUpdate(
    {macAddress: formattedMacAddress},
    {$set: {member: memberId, name, type, updated: new Date()}},
    {upsert: true, returnDocument: 'after'}
  )

  return formatDevice(updatedDeviceDocument.value)
}

export async function unpairMemberDevice(memberId, macAddress) {
  await mongo.db.collection('devices').updateOne(
    {macAddress, member: memberId},
    {$set: {member: null, updated: new Date()}}
  )
}

const formatDevice = rawDevice => ({
  _id: rawDevice._id.toString(),
  macAddress: rawDevice.macAddress,
  name: rawDevice.name,
  type: rawDevice.type,
  memberId: rawDevice.member,
  heartbeat: rawDevice.heartbeat,
  location: rawDevice.location,
  attending: differenceInMinutes(new Date(), new Date(rawDevice.heartbeat)) <= LAST_SEEN_DELAY_IN_MIN,
  updated: rawDevice.updated
})
