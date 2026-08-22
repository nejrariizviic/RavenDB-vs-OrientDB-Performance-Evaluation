/**
 * Sitne inline SVG ikonice (bez dodatne npm zavisnosti poput lucide-react),
 * koriste "currentColor" pa nasljeđuju boju teksta/dugmeta u kojem se nalaze.
 */

export function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

/** Ikonica lupe - koristi se za "Film po ID-u" (jednostavan GET) u RequestTypeSelector.tsx. */
export function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/** Ikonica trofeja - koristi se za "Top N po ocjeni" (složen GET) u RequestTypeSelector.tsx. */
export function TrophyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2.5a1.5 1.5 0 0 1 0 4H18M7 5H4.5a1.5 1.5 0 0 0 0 4H6" />
    </svg>
  );
}

/** Ikonica klapa (filmska traka) - koristi se za "Dodaj film" (jednostavan POST) u RequestTypeSelector.tsx. */
export function FilmIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 8.5 5.3 4h13.4l1.3 4.5" />
      <rect x="4" y="8.5" width="16" height="11.5" rx="1.5" />
      <path d="m7.3 4 1.8 4.5M12.1 4l1.8 4.5M16.9 4l1.8 4.5" />
    </svg>
  );
}

/** Ikonica olovke - koristi se za "Izmijeni naslov" (jednostavan PUT) u RequestTypeSelector.tsx i EditMovieModal.tsx. */
export function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.86 4.14a1.94 1.94 0 0 1 2.75 2.75L8.5 18l-4.25 1.25L5.5 15z" />
      <path d="m15.5 5.5 3 3" />
    </svg>
  );
}

/**
 * Ikonica ključa (wrench) - koristi se za "Korekcija ocjena" (složen PUT) u
 * RequestTypeSelector.tsx i CorrectRatingsModal.tsx - vizuelno jasno
 * odvojena od PencilIcon (jednostavan PUT: izmjena JEDNOG polja) jer ova
 * operacija masovno "popravlja" (koriguje) veći skup zapisa odjednom.
 */
export function WrenchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.7 6.3a4 4 0 0 0-5.6 4.9L3 17.3V21h3.7l6.1-6.1a4 4 0 0 0 4.9-5.6l-2.6 2.6-2.8-.8-.8-2.8 2.6-2.6Z" />
    </svg>
  );
}

/** Ikonica strelice nagore u krugu - koristi se za pozitivnu korekciju (delta &gt; 0) u CorrectRatingsModal.tsx/CorrectRatingsResult.tsx. */
export function TrendUpIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 17 9 11 13 15 21 7" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

/** Ikonica strelice nadole - koristi se za negativnu korekciju (delta &lt; 0) u CorrectRatingsModal.tsx/CorrectRatingsResult.tsx. */
export function TrendDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 7 9 13 13 9 21 17" />
      <path d="M15 17h6v-6" />
    </svg>
  );
}

/** Ikonica strelice udesno - koristi se u malom dijagramu toka korekcije (CorrectRatingsModal.tsx). */
export function ArrowRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Ikonica grupe ljudi - koristi se za "aktivni korisnici" statistiku u CorrectRatingsResult.tsx. */
export function UsersIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/**
 * Ikonica kante za smeće - koristi se za "Obriši tag" (jednostavan DELETE) u
 * RequestTypeSelector.tsx i DeleteTagModal.tsx - vizuelno jasno signalizira
 * destruktivnu (nepovratnu) akciju, dosljedno crvenoj "error" boji kojom je
 * DELETE metoda obojena kroz aplikaciju.
 */
export function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M18.5 7 17.75 19a2 2 0 0 1-2 1.9H8.25a2 2 0 0 1-2-1.9L5.5 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/**
 * Ikonica metle - koristi se za "Orphan cleanup" (složen DELETE) u
 * RequestTypeSelector.tsx i OrphanCleanupModal.tsx/OrphanCleanupResult.tsx -
 * vizuelno jasno odvojena od TrashIcon (jednostavan DELETE: brisanje TAČNO
 * JEDNOG poznatog zapisa) jer ova operacija masovno "pomete" (čisti) skup
 * zapisa koji zadovoljavaju uslov (nemaju nijedan tag), a ne jedan konkretan
 * resurs identifikovan po ključu - isti duh kao WrenchIcon za složen PUT.
 */
export function BroomIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 4 11 13" />
      <path d="M11 13 4 20" />
      <path d="M11 13 3.3 16.3" />
      <path d="M4 20 3.3 16.3" />
      <path d="M8.6 15.4 6.2 17.8M10.1 13.9 7.9 16.1" />
      <path d="M15.5 3.5 17 5M18 2l1.5 1.5" />
    </svg>
  );
}

/**
 * Ikonica cjenovne etikete (price tag) - koristi se u DeleteTagModal.tsx uz
 * polje za unos samog tag stringa, da vizuelno asocira na "tag" pojam.
 */
export function TagIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.59 2.59a2 2 0 0 1 1.41-.59H20a2 2 0 0 1 2 2v5.99a2 2 0 0 1-.59 1.41l-9 9a2 2 0 0 1-2.82 0l-6.99-7a2 2 0 0 1 0-2.82Z" />
      <circle cx="16.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Puna (filled) zvjezdica - koristi se i kao ikonica za "Dodaj ocjenu" u
 * RequestTypeSelector.tsx, i kao gradivni blok za StarRating.tsx (birač i
 * prikaz ocjene sa djelimičnim popunjavanjem).
 */
export function StarIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.25l2.955 6.243 6.795.673-5.106 4.647 1.53 6.687L12 16.98l-6.174 3.52 1.53-6.687-5.106-4.647 6.795-.673L12 2.25z" />
    </svg>
  );
}
