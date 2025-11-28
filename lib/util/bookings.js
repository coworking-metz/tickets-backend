// ../lib/util/scrapper.js
export async function scrapeWeek(page) {
  return page.evaluate(() => {
    const days = []

    // Find the vertical grid
    const hourRows = document.querySelectorAll('#A1_WDPLN-ZoneTitresVertical .WDPLN-HeureLibelle span')

    // Reference grid cell 7:00 → 8:00
    const first = hourRows[0].getBoundingClientRect()
    const second = hourRows[1].getBoundingClientRect()

    const hourPx = second.top - first.top
    const gridTop = first.top

    const dayHeaders = [...document.querySelectorAll('#A1_WDPLN-ZoneTitresHorizontal tr:nth-child(2) td div')]
      .map(e => e.innerText.trim())

    const containers = [...document.querySelectorAll('.WDPLN-ConteneurRendezVous[id^="A1_WDPLN-Conteneur_"]')]

    for (const [idx, col] of containers.entries()) {
      const slots = []
      const items = col.querySelectorAll('[id^="A1_WDPLN-RendezVous_"]')

      for (const item of items) {
        const bb = item.getBoundingClientRect()
        const title = item.querySelector('li')?.textContent.trim() || ''

        slots.push({
          title,
          top: bb.top,
          height: bb.height
        })
      }

      days.push({
        day: dayHeaders[idx],
        slots,
        hourPx,
        gridTop
      })
    }

    return days
  })
}

export function toTimeString(hourFloat) {
  const hour = Math.floor(hourFloat)
  const mins = Math.round((hourFloat % 1) * 60)
  return `${hour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

