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
  azureishWhite: '#D4E0FF'
}

const style = {
  tableDelete: 'border:0; border-spacing:0; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse',
  imageDelete: 'border:0 none; line-height:100%; margin:0; outline:none; padding:0; text-decoration:none; vertical-align:bottom'
}

export const renderHeader = () => {
  const imageWidth = 192
  const imageRatio = 111 / 300 // 111 is the height, 300 is the width
  return `
<tr bgcolor="${theme.meatBrown}" style="background:${theme.meatBrown}">
  <td style="${style.tableDelete}; width: 100%">
    <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="${style.tableDelete}; width: 100%;">
      <tr height="20"><td style="${style.tableDelete}"></td></tr>
      <tr>
        <td style="${style.tableDelete}; width: 100%" align="center">
          <a style="display: block;" href="https://www.coworking-metz.fr">
            <img alt="Le Poulailler - Coworking Metz"
              title="Le Poulailler - Coworking Metz logo"
              width="${imageWidth}"
              height="${imageWidth * imageRatio}"
              src="https://www.coworking-metz.fr/wp-content/uploads/2020/05/logo-Le-Poulailler-vecto-blanc-inverse%CC%81-horizontal-300.png"
              style="${style.imageDelete}; width: 100%; max-width: ${imageWidth}px; height: auto; max-height: ${imageWidth * imageRatio}px"
              valign="bottom" />
          </a>
        </td>
      </tr>
      <tr height="20"><td style="${style.tableDelete}"></td></tr>
    </table>
  </td>
</tr>
`
}

export const renderFooter = () => {
  const imageWidth = 125
  const imageRatio = 36 / 125 // 36 is the height, 125 is the width
  return `
<tr bgcolor="#EEEEEE" style="background:#EEEEEE">
  <td style="${style.tableDelete}; width: 100%">
    <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="${style.tableDelete}; width: 100%;">
      <tr height="16"><td style="${style.tableDelete}"></td></tr>
      <tr>
        <td style="${style.tableDelete}; width: 100%" align="center">
          <a style="display: block;" href="https://www.coworking-metz.fr">
            <img alt="Le Poulailler - Coworking Metz"
              title="Le Poulailler - Coworking Metz logo"
              width="${imageWidth}"
              height="${imageWidth * imageRatio}"
              src="https://www.coworking-metz.fr/wp-content/uploads/2020/06/logo-lepoulailler-mobile.png"
              style="${style.imageDelete}; width: 100%; max-width: ${imageWidth}px; height: auto; max-height: ${imageWidth * imageRatio}px"
              valign="bottom" />
          </a>
        </td>
      </tr>
      <tr height="12"><td style="${style.tableDelete}"></td></tr>
      <tr>
        <td style="${style.tableDelete}; text-align: center; color: ${theme.charlestonGreen}; font-size:1rem; line-height:1.5rem" align="center">
          Association Coworking Metz<br />
          7, avenue de Blida - 57000 Metz
        </td>
      </tr>
      <tr height="16"><td style="${style.tableDelete}"></td></tr>
    </table>
  </td>
</tr>
`
}

// @see https://www.cerberusemail.com/
export const renderHtmlLayout = htmlContent => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="viewport" content="initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=yes">
      <meta name="color-scheme" content="light dark"> <meta name="supported-color-schemes" content="light dark">
  </head>

  <body width="100%" style="-moz-text-size-adjust:none; -ms-text-size-adjust:none; -webkit-text-size-adjust:none; font-family:Helvetica, Arial, sans-serif; font-size:100%; margin:0; padding:0; text-size-adjust:none; width:100%">
    <div style="margin: 0px auto; max-width: 640px">
      <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="${style.tableDelete}; width: 100%;">
        ${renderHeader()}
        <tr height="24">
          <td style="${style.tableDelete}"></td>
        </tr>
        <tr>
          <td style="${style.tableDelete}; font-size:1rem; line-height:1.5rem">
            ${htmlContent}
          </td>
        </tr>
        <tr height="24">
          <td style="${style.tableDelete}"></td>
        </tr>
        ${renderFooter()}
        <tr height="24">
          <td style="${style.tableDelete}"></td>
        </tr>
      </table>
    </div>
  </body>
</html>`
