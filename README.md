# Genealogy

An interactive atlas of mathematical advisor relationships, with Claremont McKenna College’s tenured and tenure-track Mathematical Sciences faculty as the default group.

**[Explore the website](https://www.rtealwitter.com/genealogy/)**

The opening view frames the selected group, keeping their names readable; the home button returns to it, and the full-tree button shows all ancestry. Drag to pan, scroll to zoom, and click a person or their name chip to highlight their ancestors and descendants without moving the tree. Click the same person again, or empty background, to restore everyone. Multiple advisors and shared ancestors are preserved. The bottom-right generation slider limits ancestry while preserving your zoom, selection, and place in the tree. You can also search within the graph or focus on shared ancestry. On phones, drag from anywhere on the graph (including names), pinch with two fingers to zoom, and tap a name in the top box for a readable close-up. Each person links to the sources for their record.

The **Download tree** button offers PDF or SVG, with a preview. Printing defaults to **12 generations plus direct students on a 36 × 24-inch page**, with uniform full names and degree years. The interactive generation slider does not change this print setting. Expand **Print options** for 6 generations, all generations, a custom size that keeps names readable, or a different title. Long trees are folded into side-by-side panels only when that improves fit; matching numbered markers continue the same relationships between panels. Both formats are vectors, with embedded fonts and complete names. The preview reports paper dimensions and name size before downloading.

The default collection includes 13 documented direct students of the CMC faculty, along with their co-advisors and ancestry. Student links are confirmed on each student's MGP record; see the [student audit](data/STUDENTS-AUDIT.md). The **Include students** option hides or shows these existing records without a network lookup. Live searches for new names retrieve ancestry; the Python importer's `--include-students` option can build other collections with direct students.

## Adding new people

Open the pencil button (**Edit names**), enter one name or Mathematics Genealogy Project ID per line, and select **Update tree**. Existing records load immediately. New names are looked up through a small Cloudflare Worker; ambiguous matches ask you to choose a person. The importer follows every listed advisor, stopping at already included ancestry.

Math Genealogy requests are cached and spaced at least ten seconds apart. An entirely new tree can take several minutes. Cancel leaves the current graph intact. A lookup retrieves at most 150 new records and 30 new generations at once; unfinished records are marked. Editing a group using known names always reuses the existing data without a network lookup. The default CMC group is bundled with the site, so it works even when live lookup is unavailable.

You can also **Import genealogy JSON**. The [Python importer](scripts/README.md) creates the same data format from names or IDs and is useful for offline collections and refreshing the CMC snapshot:

```sh
python3 -m pip install -r requirements.txt
python3 scripts/fetch_genealogy.py --overlay data/cmc-roots.json --output data/genealogy.json --max-people 1000 --include-students
```

Mike Izbicki is included using the advisor relationship in his official CV, followed by Christian Shelton’s MGP ancestry. See [data provenance](data/README.md). This is an independent project; please credit and support the [Mathematics Genealogy Project](https://www.mathgenealogy.org/). Historical links can describe mentorship rather than modern PhD supervision. An empty advisor list is a limit of the included record, not evidence that a person had no advisor.

## Run locally

There is no frontend build step:

```sh
python3 -m http.server 8765
# Open http://localhost:8765
```

The site uses plain HTML, CSS, JavaScript, and SVG. [Dagre](https://github.com/dagrejs/dagre) lays out the directed graph; [jsPDF](https://github.com/parallax/jsPDF) produces vector PDFs. Both are bundled locally. The live lookup backend is isolated in [`worker/`](worker/README.md); `config.js` contains its public URL, never credentials.

For development (Node 20+):

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
# After changing dependencies:
npm run vendor
```

## Hosting

The public repository is served by GitHub Pages from `main` at `/`. The `.nojekyll` file keeps delivery static. Since `rtealwitter.github.io` already has the custom domain `www.rtealwitter.com`, GitHub Pages automatically serves this project at **www.rtealwitter.com/genealogy/**. No changes to the personal website or DNS are required.

Push a commit to `main` to update the site. The live lookup Worker is deployed separately; its deployment instructions are in [`worker/README.md`](worker/README.md).

## Small map of the code

- `app.js`, `index.html`, `style.css`: interactions, SVG rendering, and the interface.
- `graph.js`: validation, ancestry traversal, group matching, and shared ancestors.
- `live.js`: name resolution and bounded ancestry fetching.
- `poster.js`: standalone SVG and vector PDF exports.
- `data/`: cited default records and the faculty roster.
- `scripts/fetch_genealogy.py`: cached, polite data refresh/import.
- `worker/`: cached live Math Genealogy search and record lookup.

Code is MIT licensed. Source data and third-party fonts/libraries retain their own rights and attribution; see [THIRD_PARTY.md](THIRD_PARTY.md).
