import {renderHtmlLayout} from './layout.js'

function render() {
  return {
    subject: 'Plus de ticket',
    html: renderHtmlLayout(`Bonjour,<br />
<br />
Vous n'avez plus de tickets...<br />
<br />
Comme je sais que nous allons être amenés à nous recroiser prochainement, voici le lien pour rempiler en tickets ou en abonnement :
https://www.coworking-metz.fr/la-boutique/<br />
<br />
Marie-Poule du Poulailler<br />
<br />
PS: n'hésitez pas à nous contacter si vous rencontrez le moindre problème !
`)
  }
}

export default render
