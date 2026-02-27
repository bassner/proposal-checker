import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="mt-12 pb-4 text-center text-xs text-slate-300 dark:text-white/20"
      role="contentinfo"
    >
      <div className="flex items-center justify-center gap-3">
        <a
          href="https://aet.cit.tum.de/impressum/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/50"
        >
          Imprint
        </a>
        <span aria-hidden="true">&middot;</span>
        <Link
          href="/privacy"
          className="text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/50"
        >
          Privacy
        </Link>
        <span aria-hidden="true">&middot;</span>
        <span>
          Created with ❤️ by{" "}
          <a
            href="https://github.com/bassner"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/50"
          >
            @bassner
          </a>
        </span>
      </div>
    </footer>
  );
}
