// "date-fns" est une bibliothèque d'utilitaires JavaScript moderne qui fournit un ensemble d'outils simples et cohérents pour manipuler des dates JavaScript dans un navigateur et Node.js.
// "add" et "sub" sont des fonctions de "date-fns" qui sont utilisées pour ajouter ou soustraire du temps à une date donnée.
const {add, sub} = require('date-fns')

// "lodash" est une bibliothèque d'utilitaires qui fournit des méthodes utiles pour la manipulation et la combinaison de tableaux, d'objets et d'autres types de données.
// "chain" commence une enveloppe lodash permettant des séquences de chaînes de méthodes implicites,
// "range" crée un tableau de nombres (positifs et/ou négatifs) progressant du début jusqu'à, mais sans inclure, la fin.
// "minBy" et "maxBy" sont utilisés pour obtenir les valeurs minimales et maximales d'un tableau basé sur une propriété donnée.
// "sumBy" est utilisé pour obtenir la somme des valeurs d'une propriété pour chaque élément d'un tableau.
// "sortBy" est utilisé pour trier les éléments d'un tableau.
const {chain, range, minBy, maxBy, sumBy, sortBy} = require('lodash')

// "mongo" est un objet qui est utilisé pour interagir avec MongoDB.
const mongo = require('./util/mongo')

// "generateBase62String" est une fonction de notre propre module d'utilitaires qui génère une chaîne Base62 aléatoire d'une certaine longueur.
const {generateBase62String} = require('./util/base62')

// "getWpUser" est une fonction importée de notre propre module d'utilitaires WordPress. Il récupère les données utilisateur d'un backend WordPress.
const {getUser: getWpUser} = require('./util/wordpress')

// "getPeriods" et "getDays" sont des fonctions d'aide de notre propre module d'utilitaires "dates", qui fournit des fonctionnalités pour travailler avec des dates.
const {getPeriods, getDays} = require('./dates')



/**
 * Ajoute des tickets à un utilisateur
 * 
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {Date} purchaseDate - Date d'achat
 * @param {number} quantity - Quantité de tickets
 */
async function addTickets(userId, purchaseDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.tickets': {
          purchaseDate,
          tickets: quantity
        }
      }
    }
  )
}

/**
 * Ajoute un abonnement à un utilisateur
 * 
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {Date} purchaseDate - Date d'achat
 * @param {Date} startDate - Date de début
 * @param {number} quantity - Quantité
 */
async function addAbo(userId, purchaseDate, startDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.abos': {
          $each: range(quantity).map(i => ({
            purchaseDate,
            aboStart: add(new Date(startDate), {months: i}).toISOString().slice(0, 10)
          }))
        }
      }
    }
  )
}
/**
 * Ajoute un abonnement à un utilisateur
 * 
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {Date} purchaseDate - Date d'achat
 * @param {Date} membershipStart - Date de début du membership
 */
async function addMembership(userId, purchaseDate, membershipStart) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.memberships': {
          purchaseDate,
          membershipStart
        }
      }
    }
  )
}

/**
 * Récupère un identifiant d'utilisateur par email
 * 
 * @param {string} email - Adresse email de l'utilisateur
 * @returns {string} userId - Identifiant de l'utilisateur
 */
async function getUserIdByEmail(email) {
  const user = await mongo.db.collection('users')
    .findOne({emails: {$elemMatch: {address: email}}}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}

/**
 * Crée un nouvel utilisateur
 * 
 * @param {object} userObj - Informations sur l'utilisateur
 * @returns {object} user - L'utilisateur créé
 */
async function createUser({wpUserId, firstName, lastName, email}) {
  const user = {
    _id: generateBase62String(17),
    wpUserId,
    createdAt: new Date(),
    emails: [
      {address: email, verified: false}
    ],
    services: {},
    profile: {
      tickets: [],
      presences: [],
      abos: [],
      memberships: [],
      macAddresses: [],
      firstName,
      lastName,
      isAdmin: false,
      balance: 0,
      heartbeat: null,
    }
  }

  await mongo.db.collection('users').insertOne(user)
  return user
}
/**
 * Récupère un identifiant d'utilisateur par wpUserId
 * 
 * @param {string} wpUserId - Identifiant WordPress de l'utilisateur
 * @returns {string} userId - Identifiant de l'utilisateur
 */
async function getUserIdByWpUserId(wpUserId) {
  const user = await mongo.db.collection('users').findOne({wpUserId}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}
/**
 * Récupère l'identifiant d'utilisateur correspondant ou crée un nouvel utilisateur
 * 
 * @param {string} wpUserId - Identifiant WordPress de l'utilisateur
 * @returns {string} userId - Identifiant de l'utilisateur
 */
async function findOrCreateRelatedUserId(wpUserId) {
  const {email, first_name: firstName, last_name: lastName} = await getWpUser(wpUserId)
  const userId = await getUserIdByWpUserId(wpUserId) || await getUserIdByEmail(email)

  if (userId) {
    await mongo.db.collection('users').updateOne(
      {_id: userId},
      {
        $set: {
          wpUserId,
          emails: [{address: email, verified: false}],
          'profile.firstName': firstName,
          'profile.lastName': lastName
        }
      }
    )
    return userId
  }

  const user = await createUser({wpUserId, firstName, lastName, email})
  return user._id
}
/**
 * Synchronise les données d'un utilisateur
 * 
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {object} wpUserData - Données utilisateur de WordPress
 */
async function syncUser(userId, wpUserData) {
  const user = await mongo.db.collection('users').findOne({_id: userId}, {projection: {wpUserId: 1}})

  if (!user) {
    throw new Error(`Unable to sync ${userId}: user not found`)
  }

  const {wpUserId} = user

  if (!wpUserId) {
    throw new Error(`Unable to sync ${userId}: no related wpUserId`)
  }

  const wpUser = wpUserData || await getWpUser(wpUserId)

  if (!wpUser) {
    throw new Error(`Unable to sync ${userId}: WP user ${wpUserId} not found`)
  }

  const {email, first_name: firstName, last_name: lastName} = wpUser

  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $set: {
        emails: [{address: email, verified: false}],
        'profile.firstName': firstName,
        'profile.lastName': lastName
      }
    }
  )
}
/**
 * Récupère la date correspondant à un mois avant la date donnée.
 *
 * @param {string} date - Date de référence.
 * @returns {string} - Date correspondant à un mois avant la date donnée au format ISO et tronquée à 10 caractères.
 */
function getDateOneMonthBefore(date) {
  return sub(new Date(date), {months: 1}).toISOString().slice(0, 10)
}

/**
 * Vérifie si une présence donnée s'est produite pendant la durée d'un abonnement.
 *
 * @param {string} presenceDate - Date de la présence à vérifier.
 * @param {Object[]} abos - Liste des abonnements de l'utilisateur.
 * @returns {boolean} - Retourne vrai si la présence a eu lieu pendant un abonnement, sinon faux.
 */
function isPresenceDuringAbo(presenceDate, abos) {
  const oneMonthBefore = getDateOneMonthBefore(presenceDate)

  return abos.some(
    abo => oneMonthBefore < abo.aboStart && abo.aboStart <= presenceDate
  )
}

/**
 * Calcule le solde d'un utilisateur en tenant compte des abonnements, des billets et des présences.
 *
 * @param {Object} user - Objet utilisateur contenant les informations de profil (membres, abonnements, billets, présences).
 * @returns {number} - Solde calculé de l'utilisateur.
 */
function computeBalance(user) {
  const {memberships, abos, tickets, presences} = user.profile

  const oldMembershipsCount = memberships
    .filter(m => m.purchaseDate < '2017-02-01')
    .length

  const purchasedTickets = sumBy(tickets, 'tickets')

  const usedTickets = presences
    .reduce((sum, presence) => {
      const isDuringAbo = isPresenceDuringAbo(presence.date, abos)
      return isDuringAbo ? sum : sum + presence.amount
    }, 0)

  const firstPresence = minBy(presences, 'date')
  const freeTicket = firstPresence && firstPresence.date < '2017-02-01' ? 1 : 0

  return freeTicket + oldMembershipsCount + purchasedTickets - usedTickets
}


async function updateBalance(userId) {
  const user = await mongo.db.collection('users').findOne({_id: userId})

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const balance = computeBalance(user)

  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {$set: {'profile.balance': balance}}
  )

  return balance
}

function computeLastMembership(memberships) {
  const lastMembership = maxBy(memberships, 'purchaseDate')

  if (lastMembership) {
    const purchaseMonth = Number.parseInt(lastMembership.purchaseDate.slice(5, 7), 10)
    const purchaseYear = Number.parseInt(lastMembership.purchaseDate.slice(0, 4), 10)
    return String(purchaseMonth >= 11 ? purchaseYear + 1 : purchaseYear)
  }
}

function computeMembershipOk(lastMembership) {
  const now = new Date()
  const currentYear = now.toISOString().slice(0, 4)

  return lastMembership && lastMembership >= currentYear
}

function computeUserStats(user) {
  const today = (new Date()).toISOString().slice(0, 10)

  const userStats = {
    firstName: user.profile.firstName,
    lastName: user.profile.lastName,
    email: user.emails[0].address
  }
  userStats.balance = user.profile.balance

  const lastAbo = maxBy(user.profile.abos, 'aboStart')

  if (lastAbo) {
    const lastAboEnd = sub(add(new Date(lastAbo.aboStart), {months: 1}), {days: 1})
      .toISOString().slice(0, 10)

    if (today <= lastAboEnd) {
      userStats.lastAboEnd = lastAboEnd
    }
  }

  userStats.lastMembership = computeLastMembership(user.profile.memberships)
  userStats.membershipOk = computeMembershipOk(userStats.lastMembership)

  const sixMonthsAgo = sub(new Date(), {months: 6}).toISOString().slice(0, 10)

  const sixMonthsActivity = chain(user.profile.presences)
    .filter(p => p.date >= sixMonthsAgo)
    .sumBy('amount')
    .value()

  userStats.activity = sixMonthsActivity
  userStats.activeUser = sixMonthsActivity >= 20

  const totalActivity = sumBy(user.profile.presences, 'amount')

  userStats.totalActivity = totalActivity
  userStats.presencesConso = totalActivity
  userStats.presencesJours = user.profile.presences.length
  userStats.trustedUser = totalActivity >= 10

  const abos = sortBy(user.profile.abos, 'aboStart')
    .map(abo => {
      const {aboStart, purchaseDate} = abo
      const aboEnd = sub(add(new Date(aboStart), {months: 1}), {days: 1}).toISOString().slice(0, 10)
      const current = today >= aboStart && today <= aboEnd
      return {purchaseDate, aboStart, aboEnd, current}
    })
    .reverse()

  userStats.abos = abos
  return userStats
}

async function getUsers() {
  const users = await mongo.db.collection('users').find({}).toArray()
  return users
}

async function computeIncomes(periodType, from, to) {
  const users = await getUsers()

  const datesIndex = {}

  for (const user of users) {
    for (const p of user.profile.presences) {
      const {date, amount} = p

      if (!datesIndex[date]) {
        datesIndex[date] = []
      }

      datesIndex[date].push({
        user,
        date,
        amount,
        abo: isPresenceDuringAbo(date, user.profile.abos)
      })
    }
  }

  const periods = getPeriods(periodType, from, to)

  return periods.map(period => {
    const days = getDays(new Date(period[0]), new Date(period[1]))
    const {usedTickets, daysAbo} = days.reduce((dataObj, dayPeriod) => {
      const day = dayPeriod[0]
      const dateEntries = datesIndex[day] || []
      const tickets = dateEntries.filter(e => !e.abo).reduce(
        (ticketsSum, e) => ticketsSum + e.amount,
        0
      )
      const activeAbo = users.filter(u => isPresenceDuringAbo(day, u.profile.abos)).length
      dataObj.usedTickets += tickets
      dataObj.daysAbo += activeAbo
      return dataObj
    }, {usedTickets: 0, daysAbo: 0})

    return {
      date: period[0],
      type: periodType,
      data: {usedTickets, daysAbo, incomes: (6 * usedTickets) + (2 * daysAbo)}}
  })
}

module.exports = {
  addTickets,
  addAbo,
  addMembership,
  getUserIdByEmail,
  getUserIdByWpUserId,
  findOrCreateRelatedUserId,
  isPresenceDuringAbo,
  computeBalance,
  updateBalance,
  syncUser,
  computeUserStats,
  computeIncomes,
  computeLastMembership,
  computeMembershipOk
}
