import {utcToZonedTime} from 'date-fns-tz'

// @see https://www.cerberusemail.com/
export const renderHtmlLayout = (htmlContent, title) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=yes">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    ${title ? `<title>${title}</title>` : ''}

    <!-- What it does: Makes background images in 72ppi Outlook render at correct size. -->
    <!--[if gte mso 9]>
    <xml>
        <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
    </xml>
    <![endif]-->

    ${CSS_RESET}
    ${PROGRESSIVE_ENHANCEMENT}
  </head>

  <body width="100%" style="-moz-text-size-adjust:none; -ms-text-size-adjust:none; -webkit-text-size-adjust:none; font-family:Helvetica, Arial, sans-serif; font-size:100%; margin:0; padding:0; text-size-adjust:none; width:100%">
    <div style="max-width: 512px; margin: 0 auto;" class="email-container">
      <!--[if mso]>
      <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="680">
      <tr>
      <td>
      <![endif]-->

      <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="${style.tableDelete}; width: 100%;">
        ${header()}
        ${spacer(24)}
        <tr>
          <td style="${style.tableDelete}">
            ${htmlContent}
          </td>
        </tr>
        ${spacer(28)}
        ${footer()}
        ${spacer(28)}
      </table>

      <!--[if mso]>
      </td>
      </tr>
      </table>
      <![endif]-->
    </div>
  </body>
</html>`

// https://www.color-name.com/
export const theme = {
  meatBrown: '#EAB234',
  maizeCrayola: '#EEC15D',
  peachYellow: '#F7E0AE',
  papayaWhip: '#FBF0D6',
  darkVanilla: '#D9CB9E',
  onyx: '#374140',
  charlestonGreen: '#2A2C2B',
  silverSand: '#BDC3C7',
  blueCrayola: '#2962FF',
  frenchSkyBlue: '#7FA1FF',
  babyBlueEyes: '#A9C0FF',
  azureishWhite: '#D4E0FF',
  white: '#FFFFFF',
  black: '#000000'
}

const style = {
  tableDelete: 'border:0; border-spacing:0; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse',
  imageDelete: 'border:0 none; line-height:100%; margin:0; outline:none; padding:0; text-decoration:none; vertical-align:bottom'
}

export const spacer = height => `<tr>
  <td aria-hidden="true" height="${height}" style="font-size: 0; line-height: 0px;">
    &nbsp;
  </td>
</tr>`

export const button = (text, href, prepend = spacer(24), append = spacer(24)) => `
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
  ${prepend}
  <tr>
    <td class="button-td button-td-primary" style="border-radius: 8px; background: ${theme.meatBrown};">
      <a class="button-a button-a-primary" href="${href}" style="background: ${theme.meatBrown}; border: 1px solid ${theme.meatBrown}; font-family: sans-serif; font-weight: bold; text-decoration: none; padding: 13px 17px; color: ${theme.black}; display: block; border-radius: 8px;">${text}</a>
    </td>
  </tr>
  ${append}
</table>`

export const alert = (text, prepend = spacer(24), append = spacer(24)) => `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  ${prepend}
  <tr>
    <td style="padding: 0px 2px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 12px 14px; border-radius: 8px; color: ${theme.white}; background-color: #858588;">
            ${text}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${append}
</table>
`

export const paragraph = text => `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr>
    <td style="padding: 0px 16px;">
      ${text}
    </td>
  </tr>
</table>`

export const greetings = firstName => {
  const now = new Date()
  const nowParis = utcToZonedTime(now, 'Europe/Paris')
  const currentHour = nowParis.getHours()

  return currentHour > 2 && currentHour < 18 ? `Bonjour ${firstName}` : `Bonsoir ${firstName}`
}

const header = () => {
  const imageWidth = 64
  const imageRatio = 150 / 153 // Height by width
  return `
<tr>
  <td style="${style.tableDelete}; width: 100%">
    <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="${style.tableDelete}; width: 100%;">
      ${spacer(16)}
      <tr>
        <td style="${style.tableDelete}; width: 100%; padding: 0px 16px;">
          <img alt="Le Poulailler - Coworking Metz"
            title="Le Poulailler - Coworking Metz logo"
            width="${imageWidth}"
            height="${imageWidth * imageRatio}"
            border="0"
            src="https://www.coworking-metz.fr/wp-content/uploads/2022/07/logo-le-poulailler-192x192-1-e1658156048360.png"
            style="${style.imageDelete}; width: 100%; max-width: ${imageWidth}px; height: auto; max-height: ${imageWidth * imageRatio}px"
            valign="bottom" />
        </td>
      </tr>
      ${spacer(4)}
    </table>
  </td>
</tr>
`
}

const footer = () => {
  const now = new Date()
  const imageWidth = 128
  const imageRatio = 87 / 300 // Height by width
  return `
<tr class="footer" bgcolor="#e5e5e5" style="background:#e5e5e5; color: #6b7280;">
  <td style="${style.tableDelete}; width: 100%; padding: 12px 16px; font-size: 12px; line-height: 14px;">
    <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="${style.tableDelete}; width: 100%;">
      <tr>
        <td style="${style.tableDelete}; text-align: left;" align="left">
          Copyright © ${now.getFullYear()} Association Coworking&nbsp;Metz<br />
          7 avenue de Blida, 57000 Metz
        </td>
      </tr>
      ${spacer(10)}
      <tr>
        <td style="${style.tableDelete}; text-align: left;" align="left">
          <a href="https://www.coworking-metz.fr/donnees/"
            style="font-weight: medium; text-decoration: none; color: ${theme.charlestonGreen}"
            target="_blank">Politique de données et vie privée</a>
          | Tous droits réservés.
        </td>
      </tr>
      ${spacer(10)}
      <tr>
        <td style="${style.tableDelete}; text-align: left;" align="left">
          Ceci est une notification automatique liée à votre compte Coworking&nbsp;Metz.
        </td>
      </tr>
      ${spacer(16)}
      <tr>
        <td style="${style.tableDelete}; width: 100%" align="center">
          <a style="display: block;" href="https://www.coworking-metz.fr" target="_blank">
            <img alt="Le Poulailler - Coworking Metz"
              title="Le Poulailler - Coworking Metz logo"
              width="${imageWidth}"
              height="${imageWidth * imageRatio}"
              border="0"
              src="https://www.coworking-metz.fr/wp-content/uploads/2016/05/logo-lepoulailler-300x87.png"
              style="${style.imageDelete}; width: 100%; max-width: ${imageWidth}px; height: auto; max-height: ${imageWidth * imageRatio}px"
              valign="bottom" />
          </a>
        </td>
      </tr>
      ${spacer(8)}
    </table>
  </td>
</tr>
`
}

const CSS_RESET = `<style>
  /* What it does: Tells the email client that both light and dark styles are provided. A duplicate of meta color-scheme meta tag above. */
  :root {
    color-scheme: light dark;
    supported-color-schemes: light dark;
  }

  /* What it does: Remove spaces around the email design added by some email clients. */
  /* Beware: It can remove the padding / margin and add a background color to the compose a reply window. */
  html,
  body {
      margin: 0 auto !important;
      padding: 0 !important;
      height: 100% !important;
      width: 100% !important;
  }

  /* What it does: Stops email clients resizing small text. */
  * {
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
  }

  /* What it does: Centers email on Android 4.4 */
  div[style*="margin: 16px 0"] {
      margin: 0 !important;
  }
  /* What it does: forces Samsung Android mail clients to use the entire viewport */
  #MessageViewBody, #MessageWebViewDiv{
      width: 100% !important;
  }

  /* What it does: Stops Outlook from adding extra spacing to tables. */
  table,
  td {
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
  }

  /* What it does: Fixes webkit padding issue. */
  table {
      border-spacing: 0 !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
      margin: 0 auto !important;
  }

  /* What it does: Uses a better rendering method when resizing images in IE. */
  img {
      -ms-interpolation-mode:bicubic;
  }

  /* What it does: Prevents Windows 10 Mail from underlining links despite inline CSS. Styles for underlined links should be inline. */
  a {
      text-decoration: none;
  }

  /* What it does: A work-around for email clients meddling in triggered links. */
  a[x-apple-data-detectors],  /* iOS */
  .unstyle-auto-detected-links a,
  .aBn {
      border-bottom: 0 !important;
      cursor: default !important;
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
  }

  /* What it does: Prevents Gmail from changing the text color in conversation threads. */
  .im {
      color: inherit !important;
  }

  /* What it does: Prevents Gmail from displaying a download button on large, non-linked images. */
  .a6S {
      display: none !important;
      opacity: 0.01 !important;
  }
  /* If the above doesn't work, add a .g-img class to any image in question. */
  img.g-img + div {
      display: none !important;
  }

  /* What it does: Removes right gutter in Gmail iOS app: https://github.com/TedGoas/Cerberus/issues/89  */
  /* Create one of these media queries for each additional viewport size you'd like to fix */

  /* iPhone 4, 4S, 5, 5S, 5C, and 5SE */
  @media only screen and (min-device-width: 320px) and (max-device-width: 374px) {
      u ~ div .email-container {
          min-width: 320px !important;
      }
  }
  /* iPhone 6, 6S, 7, 8, and X */
  @media only screen and (min-device-width: 375px) and (max-device-width: 413px) {
      u ~ div .email-container {
          min-width: 375px !important;
      }
  }
  /* iPhone 6+, 7+, and 8+ */
  @media only screen and (min-device-width: 414px) {
      u ~ div .email-container {
          min-width: 414px !important;
      }
  }
</style>`

const PROGRESSIVE_ENHANCEMENT = `<style>
  /* What it does: Hover styles for buttons */
  .button-td,
  .button-a {
      transition: all 100ms ease-in;
  }
  .button-td-primary:hover,
  .button-a-primary:hover {
      background: ${theme.maizeCrayola} !important;
      border-color: ${theme.maizeCrayola} !important;
  }

  /* Media Queries */
  @media screen and (max-width: 480px) {

      /* What it does: Forces table cells into full-width rows. */
      .stack-column,
      .stack-column-center {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          direction: ltr !important;
      }
      /* And center justify these ones. */
      .stack-column-center {
          text-align: center !important;
      }

      /* What it does: Generic utility class for centering. Useful for images, buttons, and nested tables. */
      .center-on-narrow {
          text-align: center !important;
          display: block !important;
          margin-left: auto !important;
          margin-right: auto !important;
          float: none !important;
      }
      table.center-on-narrow {
          display: inline-block !important;
      }

      /* What it does: Adjust typography on small screens to improve readability */
      .email-container p {
          font-size: 17px !important;
      }
  }

  @media (prefers-color-scheme: dark) {
      .footer {
          background: #525252 !important;
          color: #9ca3af !important;
      }

      .footer a {
          color: #e5e7eb !important;
      }
  }
</style>`

