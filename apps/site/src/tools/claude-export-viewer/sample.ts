/**
 * A made-up Claude Code export used by "Try a sample" and the tests. It covers the welcome
 * banner, thinking, tool calls with output (including the non-breaking space Claude Code puts
 * after ⎿), a collapsed tool summary, lists, code, and text hard-wrapped at 80 columns.
 */
export const SAMPLE_FILE_NAME =
  "2026-10-05-091512-the-date-picker-test-is-failing-can-you-fix-it.txt";

export const SAMPLE_EXPORT = `╭─────────────────────────────────────────────────────╮
│ ✻ Welcome to Claude Code!                           │
│                                                     │
│   /help for help, /status for your current setup    │
│                                                     │
│   cwd: /Users/mira/code/booking-widget              │
╰─────────────────────────────────────────────────────╯

❯ The date picker test is failing. Can you fix it? It started after I bumped the
  timezone library last week.

✻ Thinking…

  The user says a date picker test started failing after a timezone library
  upgrade. I should run the test first to see the actual failure.

⏺ I'll run the failing test first to see what's going on.

⏺ Bash(npm test -- DatePicker)
  ⎿  FAIL  src/DatePicker.test.tsx
       ● DatePicker › shows the selected day in the user's timezone
         Expected: "Mon, 5 Oct"
         Received: "Sun, 4 Oct"
     … +18 lines (ctrl+o to expand)

⏺ Read 2 files (ctrl+o to expand)

⏺ The test builds its date with new Date("2026-10-05"), which JavaScript parses
  as midnight UTC. The new version of the library now converts that to the
  user's timezone before formatting, so in any timezone west of UTC it becomes
  the evening of 4 October.

  There are two ways to fix it:

  1. Build the date in local time in the test, so it matches what a user would
     pick in the calendar.
  2. Pass the timezone explicitly to formatDay so the output no longer depends
     on the machine running the test.

  Option 2 is better, because the component has the same bug for real users.

⏺ Update(src/formatDay.ts)
  ⎿  Updated src/formatDay.ts with 2 additions and 1 removal
       1   export function formatDay(date: Date, timeZone: string) {
       2 -   return format(date, "EEE, d MMM");
       2 +   const zoned = toZonedTime(date, timeZone);
       3 +   return format(zoned, "EEE, d MMM");
       4   }

⏺ Bash(npm test -- DatePicker)
  ⎿  PASS  src/DatePicker.test.tsx
       ✓ shows the selected day in the user's timezone (12 ms)

⏺ The test passes now. What changed:

  - formatDay takes a timeZone argument and converts the date before
    formatting.
  - DatePicker passes the timezone from the user's settings.

  To check it yourself in another timezone:

  TZ=America/Los_Angeles npm test -- DatePicker

❯ /cost
  ⎿  Total cost: $0.04

❯ Thanks, that's it.

⏺ You're welcome.
`;
