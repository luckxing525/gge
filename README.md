# GGE Corporate Partners site

Plain HTML, CSS and JavaScript. No build step.

## Files
- `index.html` - the page
- `styles.css` - all styling (colors are set at the top under `:root`)
- `app.js` - the scoring formulas and everything on the page
- `data.js` - the company data, past donors, categories and scoring weights
- `db-local.js` - saves edits in each visitor's browser

## Put it on Vercel
1. Put these files in a GitHub repo (or drag the folder into vercel.com/new).
2. Framework preset: **Other**. Leave the build command and output directory empty.
3. Deploy.

You can also just open `index.html` in a browser to try it.

## Good to know
- Edits made on the site (status, owners, notes, scores) are saved only in that person's browser. Other people won't see them.
- To change what everyone sees, edit `data.js` and redeploy.
- The footer has a "Reset to the original data" button that clears a browser's local edits.
