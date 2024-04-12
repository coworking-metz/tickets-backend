import process from 'node:process'
import {button, renderHtmlLayout, alert, spacer, theme} from './layout.js'

const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || 'https://www.coworking-metz.fr'

function render() {
  return {
    subject: 'Solde de ticket épuisé',
    html: renderHtmlLayout(`Bonjour,<br />
<br />
Nous vous remercions de votre venue au Poulailler.<br />
Cependant, <strong>votre solde de tickets est actuellement épuisé</strong>.
Pour continuer à profiter du lieu, nous vous invitons à vous rendre sur la boutique afin d'ajuster votre situation :
${button('CONSULTER LA BOUTIQUE', new URL('/la-boutique/', WORDPRESS_BASE_URL).toString())}
Merci pour votre compréhension et à très bientôt !<br />
<br />
L'équipe du Poulailler
${alert(`🙋‍♀️ Si vous rencontrez le moindre problème, contactez-nous à <a style="font-weight: medium; text-decoration: underline; color: ${theme.meatBrown}" href="mailto:contact@coworking-metz.fr">contact@coworking-metz.fr</a> ou répondez à cet e-mail. Nous sommes là pour vous aider.`, spacer(24), '')}
`)
  }
}

export default render
