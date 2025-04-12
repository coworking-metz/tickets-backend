import got from 'got'
import createHttpError from 'http-errors'
import process from 'node:process'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

export const promptGemini = async text => {
  if (!GEMINI_API_KEY) {
    throw createHttpError(501, 'Gemini service not configured')
  }

  const geminiResult = await got.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent', {
    searchParams: {
      key: GEMINI_API_KEY
    },
    json: {
      contents: [
        {
          parts: [
            {
              text
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json'
      }
    }
  }).json()

  const [firstCandidate] = geminiResult.candidates
  const [firstContentPart] = firstCandidate.content.parts

  return firstContentPart.text
}
