import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TokenWatt — personal AI usage meter',
  description:
    'Daily token usage and cost across Claude Code, Codex and other coding agents, metered from local logs and published to one page.',
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: 'TokenWatt',
    description: 'A personal meter for AI coding-agent token usage.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
