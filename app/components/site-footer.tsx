export function SiteFooter() {
  return (
    <footer className="mt-auto pt-12 text-center">
      <a
        href="https://github.com/alberto2santos"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-xs text-zinc-500 transition hover:text-zinc-200"
        aria-label="Visite meu perfil no GitHub"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.11.82-.26.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.333-5.466-5.93 0-1.31.468-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6.006 0c2.29-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.805 5.625-5.475 5.921.43.372.814 1.102.814 2.222v3.293c0 .32.216.694.825.576C20.565 22.092 24 17.593 24 12.297c0-6.627-5.373-12-12-12Z" />
        </svg>
        <span>GitHub | @alberto2santos</span>
      </a>
    </footer>
  );
}
