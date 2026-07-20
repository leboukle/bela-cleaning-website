// Centralized image references for the first draft of the site.
//
// DEVELOPER NOTE: These are tasteful, license-free placeholder photographs
// served from Unsplash's CDN, chosen to match the brand's photography
// direction (bright natural light, modern Jersey City/Hoboken-style
// interiors, no people, no cleaning products, no logos). Before public
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
  homeHero: {
    src: unsplash("photo-1522708323590-d24dbb6b0267", 2000),
    alt: "Bright, modern living room with large windows, hardwood floors, and neatly arranged furniture.",
  } satisfies SiteImage,

  introInterior: {
    src: unsplash("photo-1484154218962-a197022b5858", 1600),
    alt: "Clean, sunlit modern kitchen with white countertops and minimal clutter.",
  } satisfies SiteImage,

  serviceStandard: {
    src: unsplash("photo-1556911220-bff31c812dba", 1400),
    alt: "Tidy kitchen with light countertops and organized surfaces.",
  } satisfies SiteImage,

  serviceDeep: {
    src: unsplash("photo-1584622650111-993a426fbf0a", 1400),
    alt: "Bright, spotless bathroom with white tile and neatly folded towels.",
  } satisfies SiteImage,

  serviceMoveInOut: {
    src: unsplash("photo-1560185127-6ed189bf02f4", 1400),
    alt: "Empty, sunlit apartment room with hardwood floors ready for move-in.",
  } satisfies SiteImage,

  busyProfessionals: {
    src: unsplash("photo-1493809842364-78817add7ffb", 1600),
    alt: "Calm, bright bedroom with fresh white linens and natural light.",
  } satisfies SiteImage,

  aboutHero: {
    src: unsplash("photo-1493663284031-b7e3aefcae8e", 1800),
    alt: "Refined, bright living room in a modern apartment with large windows.",
  } satisfies SiteImage,

  aboutLocal: {
    src: unsplash("photo-1502672260266-1c1ef2d93688", 1400),
    alt: "Contemporary apartment building exterior with floor-to-ceiling windows.",
  } satisfies SiteImage,

  serviceArea: {
    src: unsplash("photo-1567016432779-094069958ea5", 1600),
    alt: "Bright, modern living space typical of Jersey City and Hoboken apartments.",
  } satisfies SiteImage,

  aboutContact: {
    src: unsplash("photo-1598928506311-c55ded91a20c", 1200),
    alt: "Neatly organized entryway with natural light.",
  } satisfies SiteImage,
} as const;
