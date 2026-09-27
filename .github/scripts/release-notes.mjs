// Drafts Markdown release notes for a Trekv4 release with the Claude API.
//
// Used by .github/workflows/build-pbw.yml only when no hand-written notes exist
// in .github/release-notes/. Run from the repository root (it shells out to
// git). Writes the notes to the path in NOTES_OUT; exits non-zero on any
// failure so the workflow can fall back to GitHub's generated notes alone.
//
// Env: ANTHROPIC_API_KEY, TAG (e.g. v6.1.0 or v6.1.0-rc1), NOTES_OUT,
//      CLAUDE_MODEL (optional, default claude-opus-5).

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const TAG = process.env.TAG;
const NOTES_OUT = process.env.NOTES_OUT;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
// ~150k tokens of diff. Past this the diff is cut and the model is told so.
const MAX_DIFF_CHARS = 600000;
// Paths whose diffs are noise to a reader: binaries, lockfiles, generated code.
const DIFF_EXCLUDES = [
  ":(exclude)resources/**",
  ":(exclude)package-lock.json",
  ":(exclude)**/*.gen.js",
  ":(exclude)src/c/frame_tables.h",
  ":(exclude)test/fixtures/**",
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

// A final release summarises everything since the previous final release; a
// pre-release summarises everything since the previous tag of any kind.
function previousTag(tag) {
  const isPre = tag.includes("-");
  const tags = git("tag", "--merged", "HEAD", "--sort=-v:refname", "--list", "v*")
    .split("\n").filter((t) => t && t !== tag);
  return tags.find((t) => isPre || !t.includes("-")) || null;
}

const prev = previousTag(TAG);
const range = prev ? `${prev}..HEAD` : "HEAD";
const commits = git("log", "--no-merges", "--format=### %s%n%n%b", range);
// With no previous tag, diff against the empty tree so the whole project shows.
const base = prev || git("hash-object", "-t", "tree", "/dev/null").trim();
const stat = git("diff", "--stat=120", base, "HEAD");
let diff = git("diff", base, "HEAD", "--", ".", ...DIFF_EXCLUDES);
let truncated = false;
if (diff.length > MAX_DIFF_CHARS) {
  diff = diff.slice(0, MAX_DIFF_CHARS);
  truncated = true;
  console.log(`::warning::Diff truncated to ${MAX_DIFF_CHARS} characters for the notes prompt`);
}

const system = `You write GitHub release notes for Trekv4, an LCARS-style watchface for Pebble and Rebble watches (native C on the watch, PebbleKit JS + Clay settings page on the phone).

Readers are mostly watch owners; a few are developers. Write Markdown only, with no preamble or sign-off:
- Start with a one- or two-sentence summary of the release.
- Then group changes under "### " headings (for example: New, Improved, Fixed, Settings, Under the hood). Omit empty groups.
- Every change is a "- " bullet. Lead with what the user sees or can do; add the technical reason only when it helps. Bold the key phrase of important bullets.
- Only state what the commits and diff support. Do not invent features, numbers, or compatibility claims. Leave out trivial churn (formatting, comment edits, test-only refactors) unless it matters to users.
- Do not mention AI, language models, or how these notes were produced. Do not add a changelog link; one is appended automatically.`;

const user = `Release: ${TAG}
Previous release: ${prev || "none (first release; summarise the project as it stands)"}

<commit_messages>
${commits}
</commit_messages>

<diffstat>
${stat}
</diffstat>

<diff${truncated ? ' truncated="true"' : ""}>
${diff}
</diff>
${truncated ? "\nThe diff above was cut off at a size limit; rely on the commit messages and diffstat for the rest." : ""}`;

const client = new Anthropic();
const stream = client.beta.messages.stream({
  model: MODEL,
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  // Re-run a safety-classifier decline on Anthropic's recommended fallback model.
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  system,
  messages: [{ role: "user", content: user }],
});
const message = await stream.finalMessage();

if (message.stop_reason === "refusal") {
  console.error(`::error::Release-notes request was declined (${message.stop_details?.category ?? "no category"})`);
  process.exit(1);
}
if (message.stop_reason === "max_tokens") {
  console.error("::error::Release notes hit max_tokens and would be truncated");
  process.exit(1);
}
const notes = message.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
if (!notes) {
  console.error("::error::Release-notes response contained no text");
  process.exit(1);
}
writeFileSync(NOTES_OUT, notes + "\n");
console.log(`Drafted ${notes.length} characters of notes for ${TAG} (since ${prev || "the beginning"}) with ${message.model}`);
