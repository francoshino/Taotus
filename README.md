# Taotus

Marketing site for **taotus.com** — B2B sourcing: Connect. Source. Deliver.

Plain HTML/CSS/JS, no build step. Later this may be rebuilt in Angular for deployment.

## Run locally

Open `index.html` directly, or serve the folder:

```
npx serve .
```

## Layout

| File | Purpose |
| --- | --- |
| `index.html` | Page markup (recovered from the original ChatGPT-built draft) |
| `styles.css` | All styling |
| `app.js` | Service tabs, mobile menu, RFQ draft builder (copy / download), dialogs |
| `favicon.svg` | Icon |
| `reference/` | Original saved source, kept for comparison (git-ignored) |

## Notes

- The RFQ form builds a draft in the browser only; nothing is sent anywhere yet.
- The site is indexable (`robots.txt` and `sitemap.xml` are published). To hide it again, add `<meta name="robots" content="noindex, nofollow">` to `index.html`.
- Private notes (`*.docx`) are git-ignored on purpose; never commit passwords.
