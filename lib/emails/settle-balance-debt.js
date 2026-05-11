import process from 'node:process'
import {button, greetings, helpAlert, paragraph, renderHtmlLayout, spacer} from './layout.js'

const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || 'https://www.coworking-metz.fr'

const BASE_SUBJECT = 'Régularisation de votre dette de DEBT'
const BASE_TEMPLATE = `GREETINGS,

Nous vous remercions de votre venue au Poulailler.
Cependant, <strong>vous êtes toujours redevable de DEBT</strong>.
Pour continuer à profiter du lieu, nous vous invitons à vous rendre sur la boutique afin de régulariser votre&nbsp;situation.
CHECKOUT_BUTTON
Merci pour votre compréhension et à très bientôt&nbsp;!

L'équipe du Poulailler`

async function render(user) {
  const subject = BASE_SUBJECT
  const body = BASE_TEMPLATE
  const debt = Math.abs(user.profile.balance)
  const formattedDebt = `${debt.toLocaleString('fr-FR', {style: 'decimal'})} ${debt >= 2 ? 'tickets' : 'ticket'}`

  const checkoutUrl = new URL('/la-boutique/ticket-a-lunite', WORDPRESS_BASE_URL)
  checkoutUrl.searchParams.set('quantity', debt.toString())

  const filledSubject = subject
    .replace('DEBT', formattedDebt)

  const filledBody = body
    .replaceAll('\n', '<br />')
    .replace('GREETINGS', greetings(user.firstName))
    .replace('DEBT', formattedDebt)
    .replace(/([<br />]*CHECKOUT_BUTTON[<br />]*)/, button(debt <= 1 ? 'AJOUTER UN TICKET' : 'AJOUTER DES TICKETS', checkoutUrl.toString()))

  return {
    subject: filledSubject,
    html: renderHtmlLayout(
      `${paragraph(filledBody)}${helpAlert(spacer(24), '')}`,
      filledSubject
    )
  }
}

export default render
