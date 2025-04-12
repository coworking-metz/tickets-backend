import {Router, json} from 'express'
import w from '../util/w.js'
import {addMemberDevice, getMemberDevice, getMemberDevices, removeMemberDevice, updateMemberDevice} from '../models/device.js'
import createHttpError from 'http-errors'
import * as Audit from '../models/audit.js'

async function createRoutes() {
  const router = new Router()

  router.get('', w(async (req, res) => {
    const memberId = req.rawUser._id
    if (!memberId) {
      throw createHttpError(400, 'Missing member id')
    }

    const devices = await getMemberDevices(memberId)
    res.send(devices)
  }))

  router.post('', json(), w(async (req, res) => {
    const memberId = req.rawUser._id
    if (!memberId) {
      throw createHttpError(400, 'Missing member id')
    }

    const {macAddress, name, type} = req.body
    const newDevice = await addMemberDevice(memberId, macAddress, name, type)

    Audit.logAuditTrail(req.user, 'MEMBER_DEVICE_ADD', {
      memberId,
      device: newDevice
    })

    res.send(newDevice)
  }))

  router.get('/:deviceId', w(async (req, res) => {
    const memberId = req.rawUser._id
    if (!memberId) {
      throw createHttpError(400, 'Missing member id')
    }

    const {deviceId} = req.params
    if (!deviceId) {
      throw createHttpError(400, 'Missing device id')
    }

    const device = await getMemberDevice(memberId, deviceId)

    res.send(device)
  }))

  router.put('/:deviceId', json(), w(async (req, res) => {
    const memberId = req.rawUser._id
    if (!memberId) {
      throw createHttpError(400, 'Missing member id')
    }

    const {deviceId} = req.params
    if (!deviceId) {
      throw createHttpError(400, 'Missing device id')
    }

    const device = await getMemberDevice(memberId, deviceId)
    const {macAddress, name, type} = req.body
    const updatedDevice = await updateMemberDevice(
      device.memberId,
      device._id,
      macAddress,
      name,
      type
    )

    Audit.logAuditTrail(req.user, 'MEMBER_DEVICE_UPDATE', {
      memberId,
      previousDevice: device,
      device: updatedDevice
    })

    res.send(updatedDevice)
  }))

  router.delete('/:deviceId', w(async (req, res) => {
    const memberId = req.rawUser._id
    if (!memberId) {
      throw createHttpError(400, 'Missing member id')
    }

    const {deviceId} = req.params
    if (!deviceId) {
      throw createHttpError(400, 'Missing device id')
    }

    const device = await getMemberDevice(memberId, deviceId)
    await removeMemberDevice(device.memberId, device._id)

    Audit.logAuditTrail(req.user, 'MEMBER_DEVICE_REMOVE', {
      memberId,
      device
    })

    res.status(204).send()
  }))

  return router
}

const routes = await createRoutes()
export default routes
