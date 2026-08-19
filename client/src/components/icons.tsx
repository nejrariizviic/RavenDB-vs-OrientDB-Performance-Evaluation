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
