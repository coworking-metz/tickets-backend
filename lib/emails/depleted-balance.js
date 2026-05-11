import {isArray} from 'lodash-es'
import process from 'node:process'
import {promptGemini} from '../services/gemini.js'
import {notifyOnSignal} from '../services/home-assistant.js'
import {button, greetings, helpAlert, paragraph, renderHtmlLayout, spacer} from './layout.js'

const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || 'https://www.coworking-metz.fr'
const WRITE_EMAILS_WITH_GEMINI = process.env.WRITE_EMAILS_WITH_GEMINI === '1'

const GEMINI_PROMPT = `
Tu fais parti de l'équipe qui gère un espace de bureaux partagés (appelé Le Poulailler) où les usagers peuvent venir
comme ils le souhaitent à condition d'avoir un solde suffisant.
Le solde est automatiquement calculé en fonction du nombre de tickets restants ou d'un abonnement actif.
Les tickets et abonnements peuvent être achetés sur la boutique en ligne.
Un usager vient d'arriver dans l'espace de Coworking
et est actuellement sur place mais son solde est nul ou négatif.
L'usager peut continuer à profiter du lieu comme il veut.
Tu lui rédiges un mail lui indiquant de se régulariser.
Tu prends un air décontracté, agréable, gentil et sympa pour le rappeler à l'ordre.
Sois créatif, original, familier et très concis. Un paragraphe ne peut pas contenir plus de 2 phrases.
Tu mets une information en gras pour attirer l'attention à l'aide des balises HTML <strong> et cette information ne doit pas contenir "CHECKOUT_BUTTON".
Tu fais varier l'objet et le contenu selon le nombre de visites sans régularisation et selon le jour de l'année.
Il est déjà venu DEPLETED_COUNT fois sans se régulariser : entre 0 et 3, c'est acceptable, au-délà, il faut sévir.
Le contenu et l'objet doit être jovial, enjoué et ne pas contenir de salutations ni d'émoji.
Le contenu doit faire preuve d'empathie.
Tu peux mettre jusqu'à 1 émoji dans le contenu. Il ne peut pas être suivi de ponctuation.
Tu utilises l'écriture inclusive et tu vouvoies l'usager.
Tu n'indiques pas de nous contacter en cas de questions.
Le résultat doit être un seul objet au format JSON avec 2 propriétés "subject" et "body".
Tu conserves les textes "CHECKOUT_BUTTON" et "GREETINGS" dans le contenu. Absolument. C'est très important. J'insiste.
Tu signes la fin du message avec "L'équipe du Poulailler".
Voici le modèle de base que tu modifies à ton aise :
`

const BASE_SUBJECT = 'Solde de ticket insuffisant'
const BASE_TEMPLATE = `GREETINGS,

Nous vous remercions de votre venue au Poulailler.
Cependant, <strong>votre solde de tickets est actuellement&nbsp;épuisé</strong>.
Pour continuer à profiter du lieu, nous vous invitons à vous rendre sur la boutique afin d'ajuster votre&nbsp;situation.
CHECKOUT_BUTTON
Merci pour votre compréhension et à très bientôt&nbsp;!

L'équipe du Poulailler`

async function render(user) {
  let subject = BASE_SUBJECT
  let body = BASE_TEMPLATE

  if (WRITE_EMAILS_WITH_GEMINI) {
    await (async () => {
      const geminiResponse = await promptGemini(`${GEMINI_PROMPT} ${BASE_TEMPLATE}`)
      const generatedText = JSON.parse(geminiResponse)

      // Because sometimes, Gemini returns an array with multiple responses
      if (isArray(generatedText)) {
        const [firstResponse] = generatedText
        subject = firstResponse.subject || BASE_SUBJECT
        body = firstResponse.body || BASE_TEMPLATE
      } else {
        subject = generatedText.subject || BASE_SUBJECT
        body = generatedText.body || BASE_TEMPLATE
      }
    })().catch(error => {
      // It's fine but we should notify the tech team
      notifyOnSignal(`Impossible de rédiger le mail de solde épuisé avec Gemini :\n${error.message}`)
        .catch(notifyError => {
          // Don't throw an error if the notification failed
          console.error('Unable to notify about depleted-balance error', notifyError)
        })
    })
  }

  const filledSubject = subject
    .replace('MEMBER_NAME', user.firstName)

  const filledBody = body
    .replaceAll('\n', '<br />')
    .replace('GREETINGS', greetings(user.firstName))
    .replace(/([<br />]*CHECKOUT_BUTTON[<br />]*)/, button('CONSULTER LA BOUTIQUE', new URL('/la-boutique/', WORDPRESS_BASE_URL).toString()))

  return {
    subject: filledSubject,
    html: renderHtmlLayout(`${paragraph(filledBody)}${helpAlert(spacer(24), '')}`, filledSubject)
  }
}

export default render
