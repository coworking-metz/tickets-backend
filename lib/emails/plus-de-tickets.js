import process from 'node:process'
import {button, renderHtmlLayout, alert, spacer, theme} from './layout.js'
import got from 'got'
import {notifyOnSignal} from '../services/home-assistant.js'

const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || 'https://www.coworking-metz.fr'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

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
Tu mettras une information en gras pour attirer l'attention à l'aide des balises HTML <strong> et cette information ne doit pas contenir "STORE_BUTTON".
Tu feras varier l'objet et le contenu selon le nombre de visites sans régularisation et selon le jour de l'année.
Il est déjà venu DEPLETED_COUNT fois sans se régulariser : entre 0 et 3, c'est acceptable, au-délà, il faut sévir.
Le contenu et l'objet doit être jovial, enjoué et ne pas contenir de salutations ni d'émoji.
Le contenu doit faire preuve d'empathie.
Tu peux mettre jusqu'à 1 émoji dans le contenu. Il ne peut pas être suivi de ponctuation.
Tu utiliseras l'écriture inclusive.
Tu n'indiqueras pas de nous contacter en cas de questions.
Le résultat doit être au format JSON avec 2 propriétés "subject" et "body".
Tu ne peux pas modifier ni supprimer le texte "STORE_BUTTON" qui indique un bouton venant vers la boutique
ainsi que "MEMBER_NAME" qui indique l'usager.
Tu signes la fin du message avec "L'équipe du Poulailler".
Voici le modèle de base que tu modifies à ton aise :
`

const BASE_SUBJECT = 'Solde de ticket épuisé'
const BASE_TEMPLATE = `Bonjour MEMBER_NAME,

Nous vous remercions de votre venue au Poulailler.
Cependant, <strong>votre solde de tickets est actuellement épuisé</strong>.
Pour continuer à profiter du lieu, nous vous invitons à vous rendre sur la boutique afin d'ajuster votre situation :
STORE_BUTTON
Merci pour votre compréhension et à très bientôt !

L'équipe du Poulailler`

async function render(user) {
  let subject = BASE_SUBJECT
  let body = BASE_TEMPLATE

  if (GEMINI_API_KEY) {
    const prompt = GEMINI_PROMPT
      .replace('DEPLETED_COUNT', Math.abs(user.profile.balance))

    const geminiResult = await got.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
      searchParams: {
        key: GEMINI_API_KEY
      },
      json: {
        contents: [
          {
            parts: [
              {
                text: `${prompt} ${BASE_TEMPLATE}`
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json'
        }
      }
    }).json().catch(error => {
      // It's fine but we should notify the tech team
      console.error(error)
      notifyOnSignal(`Impossible de rédiger le mail de solde épuisé avec Gemini :\n${error.message}`)
        .catch(notifyError => {
          // Don't throw an error if the notification failed
          console.error('Unable to notify about plus-de-tickets error', notifyError)
        })
    })

    const [firstCandidate] = geminiResult.candidates
    const [firstContentPart] = firstCandidate.content.parts
    const generatedText = JSON.parse(firstContentPart.text)
    subject = generatedText.subject
    body = generatedText.body
  }

  const enhancedSubject = subject
    .replace('MEMBER_NAME', user.firstName)

  const enhancedBody = body
    .replaceAll('\n', '<br />')
    .replace('MEMBER_NAME', user.firstName)
    .replace(/([<br />]*STORE_BUTTON[<br />]*)/, button('CONSULTER LA BOUTIQUE', new URL('/la-boutique/', WORDPRESS_BASE_URL).toString()))

  return {
    subject: enhancedSubject,
    html: renderHtmlLayout(`${enhancedBody}${alert(`🙋‍♀️ Si vous rencontrez le moindre problème, contactez-nous à <a style="font-weight: medium; text-decoration: underline; color: ${theme.meatBrown}" href="mailto:contact@coworking-metz.fr">contact@coworking-metz.fr</a> ou répondez à cet e-mail. Nous sommes là pour vous aider.`, spacer(24), '')}`)
  }
}

export default render
