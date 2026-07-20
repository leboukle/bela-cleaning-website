// Centralized image references for the site.
//
// DEVELOPER NOTE: These are tasteful, license-free placeholder photographs
// served from Unsplash's CDN, curated to read as premium residential
// architecture and interior photography (real estate / architectural
// photographers, verified against Unsplash's metadata to avoid AI-rendered
// "3D concept" images) — bright, restrained, no people, no branded
// products, no loud decorative color. Before public launch, replace `src`
// with final, licensed BeLa Cleaning photography. Keeping every image
// reference in this single file means a photo can be swapped everywhere it
// is used by editing one line here.

export type SiteImage = {
  src: string;
  alt: string;
};

function unsplash(id: string, width = 1600) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
}

export const images = {
  // Cinematic architectural hero: a sculptural, monolithic open-plan
  // kitchen and living space — used full-bleed behind a dark scrim so the
  // headline reads directly over the photograph.
  homeHero: {
    src: unsplash("photo-1747538454766-9f4f99a2de8f", 2200),
    alt: "A sculptural, architectural open-plan kitchen and living space with clean monolithic lines and large windows.",
  } satisfies SiteImage,

  introInterior: {
    src: unsplash("photo-1682888813913-e13f18692019", 1800),
    alt: "A large kitchen with a marble island and white cabinetry.",
  } satisfies SiteImage,

  serviceStandard: {
    src: unsplash("photo-1771888703722-ee7ad9143a67", 1600),
    alt: "A modern kitchen with light wood cabinetry and a large island.",
  } satisfies SiteImage,

  serviceDeep: {
    src: unsplash("photo-1756079664354-34944e001f6d", 1600),
    alt: "A modern bathroom with a marble vanity and double sinks.",
  } satisfies SiteImage,

  serviceMoveInOut: {
    src: unsplash("photo-1781249144283-454f5fb2c348", 1600),
    alt: "A modern white hallway with an arched doorway and dark flooring.",
  } satisfies SiteImage,

  // Full-bleed living room used with a dark scrim overlay for the
  // homepage's mid-page architectural break.
  busyProfessionals: {
    src: unsplash("photo-1776186243326-1d467b258232", 2000),
    alt: "A refined living room with a curved sofa, fireplace, and large windows.",
  } satisfies SiteImage,

  serviceArea: {
    src: unsplash("photo-1762529716272-b316f61502e7", 1800),
    alt: "A spacious, neutral-toned living room with large windows and natural light.",
  } satisfies SiteImage,

  workWithUsHero: {
    src: unsplash("photo-1750639258774-9a714379a093", 1800),
    alt: "An elegant living room with neutral tones and restrained decor.",
  } satisfies SiteImage,
} as const;
