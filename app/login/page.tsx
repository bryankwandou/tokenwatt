import { Logo } from '@/components/Logo';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · TokenWatt' };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="rise w-full max-w-[380px]">
        {/* The dial doubles as the page's only ornament. */}
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={46} />
          <h1 className="mt-4 text-[22px] font-semibold tracking-tight">
            Token<span className="text-watt">Watt</span>
          </h1>
          <p className="mt-1.5 text-sm text-ink-dim">
            This meter is private. Sign in to read it.
          </p>
        </div>

        <form method="POST" action="/api/login" className="panel p-6">
          {next && <input type="hidden" name="next" value={next} />}

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.13em] text-ink-faint">Username</span>
            <input
              name="user"
              autoComplete="username"
              autoFocus
              required
              spellCheck={false}
              autoCapitalize="none"
              className="mt-1.5 w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-watt"
              placeholder="username"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] uppercase tracking-[0.13em] text-ink-faint">Password</span>
            <input
              name="pass"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1.5 w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-watt"
              placeholder="••••••••"
            />
          </label>

          {/* Deliberately vague: a precise error tells an attacker which half was right. */}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-[13px] text-alert"
            >
              That username and password combination did not match. Try again.
            </p>
          )}

          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-watt px-4 py-2.5 text-sm font-medium text-chassis transition-colors hover:bg-[#f7c15c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-watt"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
          Readings are aggregate token counts only. No prompts, no code, and no file
          contents ever leave the machine that produced them.
        </p>
      </div>
    </div>
  );
}
