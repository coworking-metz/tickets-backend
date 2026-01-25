
import 'dotenv/config.js'
import process from 'node:process'
import mongo from '../../lib/util/mongo.js'
import {getOrders} from '../../lib/util/wordpress.js'
// Pour activer le dry-run, définir DRY_RUN=true dans l'environnement
const DRY_RUN = process.env.DRY_RUN === 'true'

await mongo.connect()

// Utilitaire pour indexer les commandes WordPress par userId et date (YYYY-MM-DD)
function indexOrdersByUserAndDate(orders) {
  const index = {}
  for (const order of orders) {
    // Adapter selon la structure réelle des commandes WordPress
    const userId = order.wpUserId || order.userId || order.user_id || order.memberId
    const date = order.purchaseDate || order.date || order.created_at
    if (!userId || !date) {
      continue
    }

    const day = new Date(date).toISOString().slice(0, 10) // YYYY-MM-DD

    if (!index[userId]) {
      index[userId] = {}
    }

    index[userId][day] = order
  }

  return index
}

try {
  console.log('Début de la migration : migration des abos de la collection User vers la collection Subscriptions.')

  // Trouver tous les utilisateurs avec des abos
  const usersWithAbos = await mongo.db.collection('users').find({
    'profile.abos': {$exists: true, $ne: []} // Vérifie que le champ abos existe et n'est pas vide
  }).toArray()

  console.log(`${usersWithAbos.length} utilisateurs trouvés avec des abonnements.`)

  // Préparer les opérations d'insertion dans la collection subscriptions
  const subscriptionOperations = []

  // Récupérer toutes les années de purchaseDate à migrer
  const years = new Set()
  let totalAbos = 0
  let abosBeforeLimit = 0
  for (const user of usersWithAbos) {
    for (const abo of user.profile.abos) {
      totalAbos++
      const purchaseDate = new Date(abo.purchaseDate)
      if (purchaseDate > new Date('2024-01-01')) {
        continue
      }

      abosBeforeLimit++

      years.add(purchaseDate.getFullYear())
    }
  }

  console.log(`${totalAbos} abonnements au total, ${abosBeforeLimit} avant 2024-01-01.`)
  console.log(`Années à traiter : ${[...years].join(', ')}`)

  // Récupérer et indexer les commandes WordPress par année
  const ordersByYear = {}
  const ordersIndexByYear = {}
  const yearsArray = [...years]
  const ordersResults = await Promise.all(yearsArray.map(year => getOrders(year)))
  for (const [i, year] of yearsArray.entries()) {
    const orders = ordersResults[i]
    ordersByYear[year] = orders
    ordersIndexByYear[year] = indexOrdersByUserAndDate(orders)
    console.log(`Année ${year} : ${orders.length} commandes récupérées.`)
    if (orders.length > 0) {
      console.log('Exemple de commande:', JSON.stringify(orders[0], null, 2))
    }
  }

  let abosWithOrder = 0
  let abosWithoutOrder = 0

  for (const user of usersWithAbos) {
    const memberId = user._id
    const {wpUserId} = user
    const {abos} = user.profile

    for (const abo of abos) {
      const purchaseDateObj = new Date(abo.purchaseDate)
      if (purchaseDateObj > new Date('2024-01-01')) {
        continue
      }

      const year = purchaseDateObj.getFullYear()
      const day = purchaseDateObj.toISOString().slice(0, 10)

      // Indexation WordPress : userId = wpUserId, date = day
      const ordersIndex = ordersIndexByYear[year]
      const order = ordersIndex && ordersIndex[wpUserId] && ordersIndex[wpUserId][day]
      if (order) {
        abosWithOrder++
      } else {
        abosWithoutOrder++
      }

      const existingSubscriptions = await mongo.db.collection('subscriptions').find({ // eslint-disable-line no-await-in-loop
        memberId,
        startDate: abo.aboStart,
        purchaseDate: abo.purchaseDate
      }).toArray()

      if (existingSubscriptions.length === 0) {
        console.log(`Migration de l'abo pour l'utilisateur ${memberId} avec startDate ${abo.aboStart} et purchaseDate ${abo.purchaseDate} (orderReference: ${order ? (order.orderReference || order.reference || order.id) : null})`)
        subscriptionOperations.push({
          insertOne: {
            document: {
              memberId,
              startDate: abo.aboStart,
              price: 60,
              purchaseDate: abo.purchaseDate,
              productType: 'subscription',
              orderReference: order ? (order.orderReference || order.reference || order.id) : null,
              migratedFromUsersCollection: true,
              migratedAt: new Date().toISOString()
            }
          }
        })
      }
    }
  }

  console.log(`Abonnements avec commande correspondante : ${abosWithOrder}`)
  console.log(`Abonnements sans commande correspondante : ${abosWithoutOrder}`)

  // Insérer les abos dans la collection subscriptions
  if (subscriptionOperations.length > 0) {
    if (DRY_RUN) {
      console.log(`[DRY-RUN] ${subscriptionOperations.length} abonnements seraient migrés vers la collection subscriptions.`)
      for (const op of subscriptionOperations) {
        console.log('[DRY-RUN] Prévisualisation:', JSON.stringify(op.insertOne.document, null, 2))
      }
    } else {
      const result = await mongo.db.collection('subscriptions').bulkWrite(subscriptionOperations)
      console.log(`Migration terminée : ${result.insertedCount} abonnements migrés vers la collection subscriptions.`)
    }
  } else {
    console.log('Aucun abonnement à migrer.')
  }
} catch (error) {
  console.error('Erreur lors de la migration :', error)
} finally {
  await mongo.disconnect()
}
