import {renderHtmlLayout} from './layout.js'

function render() {
  return {
    subject: 'Dernier jour de l\'abonnement',
    html: renderHtmlLayout(`Bonjour,<br />
<br />
Votre dernier jour d'abonnement est arrivé à échéance.<br />
<br />
Comme je sais que nous allons être amenés à nous recroiser prochainement, voici le lien pour rempiler en abonnement ou en tickets :
https://www.coworking-metz.fr/la-boutique/<br />
<br />
Marie-Poule du Poulailler<br />
<br />
PS: n'hésitez pas à nous contacter si vous rencontrez le moindre problème !
`)
  }
}

export default render
