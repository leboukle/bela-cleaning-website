// Centralized image references for the site.
//
// DEVELOPER NOTE: These are tasteful, license-free placeholder photographs
// served from Unsplash's free tier (verified against Unsplash's metadata to
// avoid AI-rendered "3D concept" images and paid Unsplash+ photos). The
// photography direction favors order, calm, cleanliness, and everyday
// elegance over aspirational luxury — homes a Jersey City or Hoboken
// professional could realistically live in, not a luxury-magazine spread.
// No people, no branded products, no loud decorative color. Before public
// launch, replace `src` with final, licensed BeLa Cleaning photography.
// Keeping every image reference in this single file means a photo can be
// swapped everywhere it is used by editing one line here.

export type SiteImage = {
  src: string;
  alt: string;
};

function unsplash(id: string, width = 1600) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
}

export const images = {
  // Bright, airy apartment living room with natural light and neutral
  // decor — used full-bleed behind a dark scrim so the headline reads
  // directly over the photograph.
  homeHero: {
    src: unsplash("photo-1751945965597-71171ec7a458", 2200),
    alt: "A bright, airy apartment living room with neutral decor and large windows.",
  } satisfies SiteImage,

  serviceStandard: {
    src: unsplash("photo-1771888703722-ee7ad9143a67", 1600),
    alt: "A tidy modern kitchen with light wood cabinetry and a large island.",
  } satisfies SiteImage,

  serviceDeep: {
    src: unsplash("photo-1650481093978-6cc58e4649f4", 1600),
    alt: "Neatly folded towels stacked on a wooden bathroom shelf.",
  } satisfies SiteImage,

  serviceMoveInOut: {
    src: unsplash("photo-1722153152286-d7c1ba92010f", 1600),
    alt: "An organized walk-in closet with clean white shelving.",
  } satisfies SiteImage,

  // Full-bleed, sunlit bedroom used with a dark scrim overlay for the
  // homepage's mid-page architectural break.
  busyProfessionals: {
    src: unsplash("photo-1692455067486-d4637182a61c", 2000),
    alt: "A calm, sunlit bedroom with a neatly made bed and a ceiling fan.",
  } satisfies SiteImage,

  serviceArea: {
    src: unsplash("photo-1762529716272-b316f61502e7", 1800),
    alt: "A spacious, neutral-toned living room with large windows and natural light.",
  } satisfies SiteImage,

  workWithUsHero: {
    src: unsplash("photo-1750639258774-9a714379a093", 1800),
    alt: "An elegant, realistic living room with neutral tones and restrained decor.",
  } satisfies SiteImage,
} as const;
