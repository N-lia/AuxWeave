/** Graphic-design quick prompts for Magic; a random subset is shown per editor session. */
export const MAGIC_QUICK_PROMPTS_POOL: string[] = [
  'Design a bold typographic poster for a jazz night — stacked title, date, venue, subtle texture.',
  'Create a square social graphic for a summer sale: 50% OFF, strong type, flat color blocks.',
  'Lay out a moody album cover: large serif title, artist name below, one accent shape.',
  'Make a retro event flyer: heavy headline, supporting details, geometric background pattern.',
  'Design a minimalist wine-tasting invitation card: elegant serif, date strip, thin rule lines.',
  'Build a neon-inspired gig poster for an electronic night: big condensed type, glow accents.',
  'Create a farmers market poster: hand-lettered headline feel, hours, location, veggie icons.',
  'Lay out a poetry zine cover: asymmetric title, author line, lots of negative space.',
  'Design a bold protest-style poster: one short chant, high contrast, one spot color.',
  'Make a coffee roaster label layout: bean origin, tasting notes, small batch number.',
  'Create a podcast cover art square: show title, tagline, simple microphone or wave motif.',
  'Design a film screening poster: title treatment, director credit, time and cinema name.',
  'Build a typography-only “now open” storefront poster with hours and address.',
  'Lay out a band merch T-shirt graphic: circular lockup, tour year, distressed texture hint.',
  'Create a recipe card layout: title, ingredients list, numbered steps, small illustration slot.',
  'Design a museum exhibition poster: artist name, dates, one abstract shape as art stand-in.',
  'Make a vintage travel poster for a coastal town: headline, illustration block, tagline.',
  'Create a bold quote graphic for Instagram: short quote, attribution, soft gradient wash.',
  'Lay out a vinyl record inner sleeve: track list, credits, thank-yous, minimal ornaments.',
  'Design a craft fair booth sign: brand name, what you sell, price range, social handle.',
  'Build a monochrome photography zine spread: one hero image placeholder, caption, page folio.',
  'Create a charity run bib-style graphic: event name, big number, sponsor strip.',
  'Make a letterpress wedding save-the-date: names, date, venue city, decorative border.',
  'Design a sticker sheet layout: logo repeats, small phrases, die-cut vibe with gaps.',
  'Lay out a conference name badge: attendee line, event logo, QR placeholder.',
  'Create a risograph-style gig flyer: limited palette, rough shapes, overprint fake effect.',
  'Design a chocolate bar wrapper flat: brand, flavor, percentage, pattern band.',
  'Make a “sold out” show poster with stamped look, date, and venue in small caps.',
  'Build a magazine cover mock: masthead, cover line stack, main feature headline.',
  'Create a skate deck graphic: centered emblem, bottom text, bold outline style.',
  'Lay out a candle label: scent name, notes, burn time, warning microcopy block.',
  'Design a botanical print poster: one plant illustration frame, Latin name, common name.',
  'Make a bilingual event poster: headline in two languages, shared date and map cue.',
  'Create a yearbook-style senior quote card: quote, name, small year mark.',
  'Design a record store day promo poster: crate motif, date, store name, list of deals.',
  'Build a bold “thank you” card layout: big thanks, short message, signature line.',
  'Lay out a comic con artist alley table sign: artist name, commission prices, icons.',
  'Create a soft pastel baby announcement card: name, birth date, tiny stars or moon.',
  'Design a beer can label: brewery name, style, ABV, hop illustration silhouette.',
  'Make a blackout poetry style graphic: redacted newspaper blocks with one visible poem line.',
  'Search Unsplash for a photo that fits this layout, pick the best match, and place it on the artboard.',
  'Find an Unsplash image of a mountain landscape at golden hour and add it centered behind the headline.',
]

const DEFAULT_SHOWN = 4

export function pickMagicQuickPrompts(
  count: number = DEFAULT_SHOWN,
  pool: readonly string[] = MAGIC_QUICK_PROMPTS_POOL,
): string[] {
  if (pool.length <= count) return [...pool]
  const copy = [...pool]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = copy[i]!
    copy[i] = copy[j]!
    copy[j] = t
  }
  return copy.slice(0, count)
}
