import process from 'node:process'
import {button, renderHtmlLayout, alert, spacer, theme, greetings, paragraph} from './layout.js'
import {notifyOnSignal} from '../services/home-assistant.js'
import {promptGemini} from '../services/gemini.js'
import {isArray} from 'lodash-es'

const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || 'https://www.coworking-metz.fr'
const WRITE_EMAILS_WITH_GEMINI = process.env.WRITE_EMAILS_WITH_GEMINI === '1'

const GEMINI_PROMPT = `
Tu fais parti de l'équipe qui gère un espace de bureaux partagés (appelé Le Poulailler) où les usagers peuvent venir
comme ils le souhaitent à condition d'avoir leur adhésion à jour afin d'assurer une couverture totale de leurs biens.
C'est une prérogative de notre assureur.
L'adhésion est à renouveller chaque année. Elle est disponible à l'achat sur la boutique.
L'usager vient d'arriver et tu lui rédiges un mail lui rappelant que son adhésion pour l'année en cours est manquante.
Tu prends un air décontracté, agréable, gentil et sympa pour le rappeler à l'ordre.
Sois créatif, original, familier et très concis. Un paragraphe ne peut pas contenir plus de 2 phrases.
Tu mets une information en gras pour attirer l'attention à l'aide des balises HTML <strong>
et cette information ne doit pas contenir le texte "CHECKOUT_BUTTON".
Tu fais varier l'objet et le contenu selon le nombre de visites sans régularisation et selon le jour de l'année.
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

const BASE_SUBJECT = 'Adhésion à renouveler'
const BASE_TEMPLATE = `GREETINGS,

Nous vous remercions de votre venue au Poulailler.
Cependant, <strong>votre adhésion pour l'année en cours est manquante</strong>.
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
      console.error(error)
      notifyOnSignal(`Impossible de rédiger le mail d'adhésion manquante avec Gemini :\n${error.message}`)
        .catch(notifyError => {
          // Don't throw an error if the notification failed
          console.error('Unable to notify about missing-membership error', notifyError)
        })
    })
  }

  const enhancedSubject = subject
    .replace('MEMBER_NAME', user.firstName)

  const enhancedBody = body
    .replaceAll('\n', '<br />')
    .replace('GREETINGS', greetings(user.firstName))
    .replace(/([<br />]*CHECKOUT_BUTTON[<br />]*)/, button('RENOUVELER L\'ADHÉSION', new URL('/boutique/carte-adherent/', WORDPRESS_BASE_URL).toString()))

  return {
    subject: enhancedSubject,
    html: renderHtmlLayout(
      `${paragraph(enhancedBody)}${alert(`🙋‍♀️ Si vous rencontrez le moindre problème, contactez-nous à <a style="font-weight: medium; text-decoration: underline; color: ${theme.meatBrown}" href="mailto:contact@coworking-metz.fr">contact@coworking-metz.fr</a> ou répondez à cet e-mail. Nous sommes là pour vous aider.`, spacer(24), '')}`,
      enhancedSubject
    )
  }
}

export default render
