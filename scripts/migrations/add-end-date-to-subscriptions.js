import 'dotenv/config.js'
import process from 'node:process'
import mongo from '../../lib/util/mongo.js'
import {computeSubscriptionEndDate} from '../../lib/calc.js'

// Pour activer le dry-run, définir DRY_RUN=true dans l'environnement
const DRY_RUN = process.env.DRY_RUN === 'true'

await mongo.connect()

try {
  console.log('Début de la migration : ajout d\'une endDate à toutes les subscriptions.')
  if (DRY_RUN) {
    console.log('MODE DRY-RUN - Aucune modification ne sera effectuée.')
  }

  // Trouver toutes les subscriptions sans endDate
  const subscriptions = await mongo.db.collection('subscriptions').find({
    endDate: {$exists: false}
  }).toArray()

  console.log(`${subscriptions.length} subscriptions sans endDate trouvées.`)

  if (subscriptions.length > 0) {
    // Préparer les opérations de mise à jour
    const updateOperations = subscriptions.map(s => ({
      updateOne: {
        filter: {_id: s._id},
        update: {
          $set: {
            endDate: computeSubscriptionEndDate(s.startDate)
          }
        }
      }
    }))

    if (DRY_RUN) {
      console.log(`[DRY-RUN] ${subscriptions.length} subscriptions seraient mises à jour.`)
      console.log('\nExemples de subscriptions à migrer :')
      for (const s of subscriptions.slice(0, 10)) {
        console.log(`  ${s._id}: startDate=${s.startDate} -> endDate=${computeSubscriptionEndDate(s.startDate)}`)
      }
    } else {
      // Exécuter les mises à jour par batch de 100
      const batchSize = 100
      for (let i = 0; i < updateOperations.length; i += batchSize) {
        const batch = updateOperations.slice(i, i + batchSize)
        // eslint-disable-next-line no-await-in-loop
        await mongo.db.collection('subscriptions').bulkWrite(batch)
        console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} subscriptions mises à jour.`)
      }

      console.log(`Migration complétée : ${subscriptions.length} subscriptions ont été mises à jour.`)
    }
  } else {
    console.log('Aucune subscription à migrer.')
  }
} catch (error) {
  console.error('Erreur lors de la migration :', error)
} finally {
  await mongo.disconnect()
}
