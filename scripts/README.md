# Updating the data

The website opens with a bundled snapshot and supports live lookup through its backend. This local importer is an alternative for building a complete, reproducible group at your own pace: create a JSON file, then import that file in the website.

```sh
python -m pip install -r requirements.txt
python scripts/fetch_genealogy.py --search 'Sarah Cannon'
python scripts/fetch_genealogy.py 230305 7102 --output data/custom.json
python scripts/fetch_genealogy.py --names-file my-people.txt --output data/custom.json
```

Names must be quoted at the command line. A names file contains one name, numeric MGP ID, or MGP person URL per line. Search is deliberately conservative: when more than one record matches, inspect the candidates and pass the correct ID. This avoids silently conflating people with the same name.

By default, the importer follows **academic ancestors only**. Add `--include-students` to include the selected people’s **direct students** recorded by MGP. Every student’s own record must confirm the advisor link. The importer then follows all of that student’s advisors, including co-advisors, and their ancestors within the same record/depth bounds. It never recursively follows students of students, and descendant counts in MGP’s tables are not imported as people. It preserves MGP advisor relationships and explicitly labeled historical tutors, teachers, mentors, or supervisors; non-advisor labels are recorded in the person’s note. It caches source HTML under `.cache/mgp/` (excluded from Git), makes requests sequentially at least 10 seconds apart, and defaults to at most 250 fetched records and 40 generations. `--max-people` and `--max-depth` adjust these bounds; `--delay` can make requests slower. Repeating a command reuses cached pages. To refresh a particular record, remove its cached HTML, or use a fresh `--cache` directory. Network/parser errors stop the import with an error; the most recent saved snapshot remains. Source records at a depth/count boundary remain explicit incomplete placeholders, not invented terminal ancestors.

Refresh the CMC collection with:

```sh
python scripts/fetch_genealogy.py --overlay data/cmc-roots.json --output data/genealogy.json --max-people 1000 --include-students
```

`data/cmc-roots.json` holds the selected faculty and sourced additions where MGP has no record. Update these manually from cited primary sources when the roster changes. The importer does not infer advisors from dissertation committee memberships or postdoctoral mentors.

The JSON format is `{title, description, updated, defaultRoots, people}`. With `--include-students`, `defaultStudents` lists the verified direct-student IDs and `studentNote` describes coverage limits. `defaultRoots` remains the original selected people; students are not added to the faculty selection. People without an identified MGP record cannot have their student tables checked automatically. Each person has a stable `id`, `name`, `year` (nullable), `institution`, `advisors` (IDs), and `sources` (`{label,url}` pairs). MGP records also have `mgpId`. Optional fields include `aliases`, `role`, `note`, and `incomplete`. Seed files may set `preferredName`; the importer uses it as the display name and preserves the MGP name in `aliases`. Each advisor edge is substantiated by the **student's** sources. Empty advisors mean the snapshot has no documented advisor; they do not establish that a person had no advisor. Historical MGP relationships are not necessarily modern PhD supervision, and records may contain errors. `rosterSource`, `rosterNote`, and `warnings` provide collection-level context.

This project is independent of the Mathematics Genealogy Project. Please cite and support [MGP](https://www.mathgenealogy.org/) when using its records.

Offline student-table parser checks: `python -m unittest discover -s scripts -p "test_*.py"`.
