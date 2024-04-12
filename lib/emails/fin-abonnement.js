import process from 'node:process'
import {renderHtmlLayout, button, alert, spacer, theme} from './layout.js'

const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || 'https://www.coworking-metz.fr'

function render() {
  return {
    subject: 'Abonnement arrivé à échéance',
    html: renderHtmlLayout(`Bonjour,<br />
<br />
Vous continuez de venir au Coworking et nous apprécions votre visite.<br />
Cependant, il semble que <strong>votre abonnement soit arrivé à échéance</strong>.
Vous pouvez le renouveler en quelques clics à partir de la boutique :
${button('RENOUVELER MON ABONNEMENT', new URL('/boutique/pass-resident/', WORDPRESS_BASE_URL).toString())}
Merci pour votre compréhension et votre soutien 🫶<br />
<br />
À bientôt,<br />
L'équipe du Poulailler
${alert(`🙋‍♀️ Si vous rencontrez le moindre problème, contactez-nous à <a style="font-weight: medium; text-decoration: underline; color: ${theme.meatBrown}" href="mailto:contact@coworking-metz.fr">contact@coworking-metz.fr</a> ou répondez à cet e-mail. Nous sommes là pour vous aider.`, spacer(20), '')}
`)
  }
}

export default render
