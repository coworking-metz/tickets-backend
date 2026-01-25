import 'dotenv/config.js'
import {computeBalance} from '../../lib/calc.js'
import {computeMemberActivityCoverage, getAllUsers} from '../../lib/models/member.js'
import mongo from '../../lib/util/mongo.js'

await mongo.connect()

try {
  console.log('Début de la vérification des tickets pour chaque membre.')

  // Récupérer tous les membres
  const members = await getAllUsers()

  for await (const member of members) {
    const memberActivities = await computeMemberActivityCoverage(member._id)
    const newBalance = await computeBalance(member, memberActivities)

    if (newBalance !== member.profile.balance) {
      console.log(`Incohérence pour le membre ${member._id} : newBalance=${newBalance}, balance=${member.profile.balance}`)
    }
  }

  console.log('Vérification terminée.')
} catch (error) {
  console.error('Erreur lors de la vérification :', error)
} finally {
  await mongo.disconnect()
}
