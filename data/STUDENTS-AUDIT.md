# Direct-student extension audit — September 27, 2026

**Status: complete, bounded extension.** The dataset now contains **543 people and 661 links**. All 506 original people and their 623 original links are preserved unchanged. This extension adds **13 direct doctoral students**, **24 co-advisors and their ancestors**, and **38 links**. The faculty selection remains exactly the original 12 `defaultRoots`; the 13 student IDs are recorded separately as `defaultStudents`.

## Direct students

Each entry was discovered in the selected faculty member’s MGP student table, then independently checked against the student’s own advisor field and Ph.D. degree entry. The student’s source record is the authority for the advisor edge.

| Faculty | Student | Ph.D. year | Institution | Other recorded advisors |
| --- | --- | ---: | --- | --- |
| Asuman Aksoy | [Daniel Akech Thiong](https://www.mathgenealogy.org/id.php?id=297952) | 2023 | Claremont Graduate University | — |
| Asuman Aksoy | [Monairah Alansari](https://www.mathgenealogy.org/id.php?id=218552) | 2017 | Claremont Graduate University | — |
| Lenny Fukshansky | [Maxwell Forst](https://www.mathgenealogy.org/id.php?id=296763) | 2023 | Claremont Graduate University | — |
| Lenny Fukshansky | [Glenn Henshaw](https://www.mathgenealogy.org/id.php?id=163955) | 2012 | Wesleyan University | Wai Kiu Chan |
| Lenny Fukshansky | [Sehun Jeong](https://www.mathgenealogy.org/id.php?id=335214) | 2025 | Claremont Graduate University | — |
| Lenny Fukshansky | [David Booth Kogan](https://www.mathgenealogy.org/id.php?id=282610) | 2022 | Claremont Graduate University | — |
| Lenny Fukshansky | [Xun Sun](https://www.mathgenealogy.org/id.php?id=191164) | 2015 | Claremont Graduate University | — |
| Mark Huber | [Wai Jing Jenny Law](https://www.mathgenealogy.org/id.php?id=134042) | 2009 | Duke University | — |
| Mark Huber | [Sarah Schott](https://www.mathgenealogy.org/id.php?id=182438) | 2012 | Duke University | — |
| Chiu-Yen Kao | [Patrick Choi](https://www.mathgenealogy.org/id.php?id=273822) | 2016 | Claremont Graduate University | Ali Nadim, Shui-Fung Lam |
| Chiu-Yen Kao | [Vladimir Vadimovich Delengov](https://www.mathgenealogy.org/id.php?id=269757) | 2018 | Claremont Graduate University | — |
| Chiu-Yen Kao | [Shu Su](https://www.mathgenealogy.org/id.php?id=240959) | 2010 | The Ohio State University | — |
| Chiu-Yen Kao | [Ying Wang](https://www.mathgenealogy.org/id.php?id=178986) | 2010 | The Ohio State University | — |

Counts: Asuman Aksoy **2**, Lenny Fukshansky **5**, Mark Huber **2**, and Chiu-Yen Kao **4**. The other seven selected faculty with identifiable MGP records have no students listed in their MGP tables. Michael Izbicki has no identified MGP record, so his student coverage could not be checked this way. No-student listings and the missing record do **not** establish that a faculty member has never supervised students.

The scope is direct students only: **students of these students are not recursively imported**. For example, Ying Wang’s own MGP page lists a student; that descendant is excluded. Dissertation committee membership, undergraduate research supervision, and postdoctoral mentorship were not inferred as doctoral-advisor edges.

## Co-advisor ancestry

Glenn Henshaw’s record names **Wai Kiu Chan** alongside Fukshansky. Patrick Choi’s record names **Ali Nadim** and **Shui-Fung Lam** alongside Kao. These complete advisor lists are retained. Their ancestry was fetched to documented source endpoints or joins with the original snapshot, with a strict budget of 32 additional ancestor records; only 24 were needed. These people are contextual co-advisors/ancestors, not additional CMC faculty or faculty students.

| Added co-advisor or ancestor | First listed degree year | Role in this extension |
| --- | ---: | --- |
| [Wai Kiu Chan](https://www.mathgenealogy.org/id.php?id=10554) | 1996 | Direct co-advisor |
| [Ali Nadim](https://www.mathgenealogy.org/id.php?id=35037) | 1986 | Direct co-advisor |
| [Shui-Fung Lam](https://www.mathgenealogy.org/id.php?id=100768) | 1975 | Direct co-advisor |
| [John Sollion Hsia](https://www.mathgenealogy.org/id.php?id=11353) | 1966 | Co-advisor ancestor |
| [Howard Brenner](https://www.mathgenealogy.org/id.php?id=63409) | 1958 | Co-advisor ancestor |
| [Ravi Sethi](https://www.mathgenealogy.org/id.php?id=82048) | 1973 | Co-advisor ancestor |
| [Nesmith Cornett Ankeny](https://www.mathgenealogy.org/id.php?id=11765) | 1951 | Co-advisor ancestor |
| [John Happel](https://www.mathgenealogy.org/id.php?id=66295) | — | Co-advisor ancestor |
| [Jeffrey David Ullman](https://www.mathgenealogy.org/id.php?id=44128) | 1966 | Co-advisor ancestor |
| [Donald F. Othmer](https://www.mathgenealogy.org/id.php?id=196325) | — | Co-advisor ancestor |
| [Arthur Jay Bernstein](https://www.mathgenealogy.org/id.php?id=82013) | 1962 | Co-advisor ancestor |
| [Archie Charles McKellar](https://www.mathgenealogy.org/id.php?id=82034) | 1965 | Co-advisor ancestor |
| [Wan Hee Kim](https://www.mathgenealogy.org/id.php?id=92760) | 1956 | Co-advisor ancestor |
| [Sundaram Seshu](https://www.mathgenealogy.org/id.php?id=92718) | 1955 | Co-advisor ancestor |
| [Seymour Blair Hammond](https://www.mathgenealogy.org/id.php?id=128055) | 1958 | Co-advisor ancestor |
| [Willis Laurens Emery](https://www.mathgenealogy.org/id.php?id=92644) | 1947 | Co-advisor ancestor |
| [Steven Freeman, Jr.](https://www.mathgenealogy.org/id.php?id=169330) | 1926 | Co-advisor ancestor |
| [John Douglas Ryder](https://www.mathgenealogy.org/id.php?id=92761) | 1944 | Co-advisor ancestor |
| [Frederick Samuel Dellenbaugh, Jr.](https://www.mathgenealogy.org/id.php?id=197761) | 1926 | Co-advisor ancestor |
| [Wallace L. Cassell](https://www.mathgenealogy.org/id.php?id=131580) | 1928 | Co-advisor ancestor |
| [Vannevar Bush](https://www.mathgenealogy.org/id.php?id=84507) | 1916 | Co-advisor ancestor |
| [Robert Peer Siskind](https://www.mathgenealogy.org/id.php?id=111345) | 1925 | Co-advisor ancestor |
| [Arthur Edwin Kennelly](https://www.mathgenealogy.org/id.php?id=24154) | — | Co-advisor ancestor |
| [Dugald Caleb Jackson](https://www.mathgenealogy.org/id.php?id=205173) | — | Co-advisor ancestor |

## Verification and reproduction

- Refreshed all 11 identifiable selected faculty MGP records and student tables on September 27; all agreed with the previously cached records. The 37 new person records were retrieved and verified from MGP on September 27.
- Reparsed every added record against its cached source: names, first degree year/institution, and complete advisor lists agree. All 13 student records confirm every selected-faculty link found in the faculty tables and list a Ph.D.
- Compared every original person object against the 506-person snapshot: no changes. No original edge was removed. The 12 faculty root IDs and order are unchanged.
- Checked unique IDs, complete references, reachability from faculty/students, no directed cycles, no incomplete placeholders, and no limit warnings.
- Ran offline parser tests covering ancestor/student separation, duplicate degree rows, linked descendant counts, explicit no-student records, changed table markup, and rejection when the student’s own record does not confirm the faculty relationship. All four tests passed. An ancestor-only CLI regression still reproduces the original 506 records and 623 edges exactly.

Reproduce the extended snapshot with:

```sh
python scripts/fetch_genealogy.py --overlay data/cmc-roots.json --output data/genealogy.json --max-people 1000 --include-students
```

Requests use the same cached, sequential 10-second pacing as the ancestor importer. Student lists are deduplicated by MGP ID. If a student’s own record does not confirm a faculty-table relationship, the importer stops for review rather than inventing the link. The `--max-people` and `--max-depth` bounds also apply to co-advisor ancestry.

The original historical-source caveats and ancestry audit remain in [AUDIT.md](AUDIT.md). `studentNote` records the student-coverage limits in the exported JSON.

Extended snapshot SHA-256:

`205a8a87f16f0882d6e49e8c47cd6e18edbaf8d0f7e8ab577982000ee1e1308a`
