import { Github } from "lucide-react";

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
        <Github className="h-4 w-4" aria-hidden="true" />
        <span>GitHub | @alberto2santos</span>
      </a>
    </footer>
  );
}
