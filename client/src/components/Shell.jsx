import { Link } from 'react-router-dom';

export default function Shell({ children }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">申</span>
            Study in China
          </Link>
          <Link to="/#returning" className="text-sm font-medium text-muted hover:text-ink" onClick={() => setTimeout(() => document.getElementById('returning')?.scrollIntoView({ behavior: 'smooth' }), 0)}>
            Have an ID?
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="no-print border-t border-line py-8 text-center text-[13px] text-muted">
        Keep your application ID private. Anyone with it can view and change your application.
      </footer>
    </div>
  );
}
