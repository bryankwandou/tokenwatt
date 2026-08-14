// TokenWatt rate card — plain ES module so the Node collector and the Next
// build both import it the same way. Edit the numbers freely; every cost in
// the dashboard is recomputed from raw token counts at build time.
//
// Rates are USD per 1,000,000 tokens. Cache multipliers apply to the input rate.

export default {
  updated: '2026-08-13',

  defaults: {
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2.0,
    cacheReadMultiplier: 0.1,
  },

  models: {
    'claude-fable-5':    { provider: 'claude-code', label: 'Claude Fable 5',   input: 10.0, output: 50.0 },
    'claude-mythos-5':   { provider: 'claude-code', label: 'Claude Mythos 5',  input: 10.0, output: 50.0 },
    'claude-opus-5':     { provider: 'claude-code', label: 'Claude Opus 5',    input: 5.0,  output: 25.0 },
    'claude-opus-4-8':   { provider: 'claude-code', label: 'Claude Opus 4.8',  input: 5.0,  output: 25.0 },
    'claude-opus-4-7':   { provider: 'claude-code', label: 'Claude Opus 4.7',  input: 5.0,  output: 25.0 },
    'claude-opus-4-6':   { provider: 'claude-code', label: 'Claude Opus 4.6',  input: 5.0,  output: 25.0 },
    'claude-opus-4-5':   { provider: 'claude-code', label: 'Claude Opus 4.5',  input: 5.0,  output: 25.0 },
    'claude-opus-4-1':   { provider: 'claude-code', label: 'Claude Opus 4.1',  input: 15.0, output: 75.0 },
    'claude-sonnet-5':   { provider: 'claude-code', label: 'Claude Sonnet 5',  input: 3.0,  output: 15.0 },
    'claude-sonnet-4-6': { provider: 'claude-code', label: 'Claude Sonnet 4.6',input: 3.0,  output: 15.0 },
    'claude-sonnet-4-5': { provider: 'claude-code', label: 'Claude Sonnet 4.5',input: 3.0,  output: 15.0 },
    'claude-haiku-4-5':  { provider: 'claude-code', label: 'Claude Haiku 4.5', input: 1.0,  output: 5.0 },

    'gpt-5-codex':   { provider: 'codex-cli', label: 'GPT-5 Codex',   input: 1.25, output: 10.0 },
    'gpt-5.2-codex': { provider: 'codex-cli', label: 'GPT-5.2 Codex', input: 1.75, output: 14.0 },
    'gpt-5.3-codex': { provider: 'codex-cli', label: 'GPT-5.3 Codex', input: 1.75, output: 14.0 },
    'gpt-5.4':       { provider: 'codex-cli', label: 'GPT-5.4',       input: 2.5,  output: 15.0 },
    'gpt-5.5':       { provider: 'codex-cli', label: 'GPT-5.5',       input: 5.0,  output: 30.0 },
    'gpt-5.6-sol':   { provider: 'codex-cli', label: 'GPT-5.6 Sol',   input: 5.0,  output: 30.0 },
    'gpt-5.6-terra': { provider: 'codex-cli', label: 'GPT-5.6 Terra', input: 2.0,  output: 12.0 },
    'gpt-5.6-luna':  { provider: 'codex-cli', label: 'GPT-5.6 Luna',  input: 0.2,  output: 1.2 },
  },

  // Applied when an exact model id is missing from the table. First match wins,
  // and anything priced this way is flagged as inferred in the UI.
  fallback: {
    rules: [
      { prefix: 'claude-fable',  input: 10.0, output: 50.0 },
      { prefix: 'claude-mythos', input: 10.0, output: 50.0 },
      { prefix: 'claude-opus',   input: 5.0,  output: 25.0 },
      { prefix: 'claude-sonnet', input: 3.0,  output: 15.0 },
      { prefix: 'claude-haiku',  input: 1.0,  output: 5.0 },
      { prefix: 'gpt-5',         input: 1.75, output: 14.0 },
    ],
  },

  // Rolling subscription windows, for the quota view alongside API-rate cost.
  quotaWindows: {
    'claude-code': { label: 'Claude subscription', resetHours: 120 },
    'codex-cli':   { label: 'Codex subscription',  resetHours: 168 },
  },

  providers: {
    'claude-code': { label: 'Claude Code CLI',    short: 'Claude',      auto: true },
    'codex-cli':   { label: 'Codex CLI',          short: 'Codex',       auto: true },
    'antigravity': { label: 'Antigravity Gemini', short: 'Antigravity', auto: false },
    'copilot':     { label: 'GitHub Copilot',     short: 'Copilot',     auto: false },
    'manual':      { label: 'Manual entry',       short: 'Manual',      auto: false },
  },
};
