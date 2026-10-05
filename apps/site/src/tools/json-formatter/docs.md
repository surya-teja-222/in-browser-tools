## How it works

Paste JSON or drop a `.json` file onto the page. The result updates as you type. When the input
is not valid JSON, the message under the panels names the line and column of the first problem,
and **Show in input** selects it.

- **Format** pretty prints with 2 spaces, 4 spaces or tabs.
- **Minify** removes all whitespace.
- **Sort keys** orders object keys alphabetically at every level. Arrays keep their order.

Numbers are kept exactly as written. `12345678901234567890` stays `12345678901234567890`, and
`1.50` stays `1.50`, even though JavaScript would normally round or shorten them.

## Privacy

Your JSON never leaves this tab. The page's Content Security Policy blocks all network requests,
so even a bug could not send it anywhere. Only your format settings are saved, in this browser.
