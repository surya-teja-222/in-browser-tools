## How to export a conversation

In Claude Code, run `/export` and choose to save to a file. Claude Code writes a `.txt` file
named after the date and your first prompt. Drop that file on this page, or copy the text and
paste it anywhere on the page.

## What you get

- Your prompts and Claude's replies as separate, readable turns. The line breaks the terminal
  added are removed, while lists, code and your own line breaks are kept.
- Tool calls such as `Bash(...)` or `Update(...)` as one line each. Select one to see its
  output, or turn on **Expand tool output and thinking**.
- An outline of your prompts for jumping around long sessions.
- Search that highlights every match. Press <kbd>Enter</kbd> for the next match and
  <kbd>Shift</kbd> + <kbd>Enter</kbd> for the previous one.
- **Copy as Markdown** and **Download .md** for keeping a conversation in notes or a repository.

## Limits

The export is a copy of what the terminal showed, so the viewer can only show that. Tool output
Claude Code had collapsed (`… +18 lines`) is not in the file, and there are no timestamps per
message. Exports from claude.ai and Claude Code's `.jsonl` session files are not supported yet.

## Privacy

The file is read in this tab and never uploaded. The page's Content Security Policy blocks all
network requests, and nothing is saved after you close the tab.
