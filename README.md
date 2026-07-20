# BeLa Cleaning Website

Official marketing website for BeLa Cleaning, a residential cleaning company serving Jersey City, Hoboken, Newark, and surrounding communities.

Built with Next.js (App Router), TypeScript, and Tailwind CSS.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `app/` — routes: `/` (home), `/services`, `/about` (includes `#contact`), `/privacy`, `/terms`
- `components/` — reusable UI components (header, footer, cards, forms, etc.)
- `lib/` — centralized business configuration, navigation, services, FAQs, testimonials, and image references

Business details (name, phone, email, hours, booking URL, service areas) are centralized in [`lib/config.ts`](./lib/config.ts). Update that file to change contact details site-wide.

## Before Public Launch

- Replace placeholder photography in [`lib/images.ts`](./lib/images.ts) with final, licensed BeLa Cleaning photography.
- Replace placeholder testimonials in [`lib/testimonials.ts`](./lib/testimonials.ts) with verified customer testimonials.
- Finalize legal copy on `/privacy` and `/terms` with counsel.
- Connect a production contact-form provider (see the developer note in [`components/ContactForm.tsx`](./components/ContactForm.tsx)).

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production build locally
- `npm run lint` — run ESLint
