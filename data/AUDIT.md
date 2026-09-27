# CMC snapshot audit — September 25, 2026

This records the original 506-person ancestry snapshot. The [September 27 student extension](STUDENTS-AUDIT.md) adds direct faculty students and co-advisor ancestry while preserving every record and link audited here.

**Status: all reachable source records fetched.** The traversal finished normally with no incomplete placeholders, missing references, parser failures, or depth/count-limit warnings. This means closure of the documented MGP links reachable from the selected CMC faculty; it does not establish that MGP contains every real historical advisor.

| Check | Result |
| --- | --- |
| Selected CMC faculty | 12 |
| People | 506 |
| Advisor/academic mentor links | 623 |
| MGP person records audited against cached source HTML | 505 |
| Faculty-CV supplement | 1: Michael Izbicki |
| Ancestors shared by at least two selected faculty | 330 |
| Ancestors shared by all twelve faculty | 0 |
| Undirected connected components | 1 |
| Source records with no documented advisor | 71 |
| Records with no listed degree year | 74 |
| First listed degree years | 1068–2025 |
| Longest ancestor chain | 57 links |
| Maximum breadth-first discovery depth from the group | 33 |

The crawl used a 1,000-record cap and a discovery-depth limit of 40, with at least 10 seconds between uncached upstream requests. Neither bound was reached. Shared ancestors can be reached along paths of different lengths; the longest chain can therefore exceed the shortest discovery depth.

## Changes from the published 209-person snapshot

This update adds **297 people and 396 links**, with no people or links removed. The 12 faculty members and their direct advisor relationships are unchanged. Previously unfinished records are now retrieved. Among previously completed records, the only advisor-list correction is George Howard Darwin → Edward John Routh, which MGP explicitly labels **Tutor**. The newly completed ancestry joins the previously disconnected branches into one component. The visual layout may therefore change even though existing relationships are preserved.

## Verification

The audit checked unique IDs, all 12 distinct roots, reachability of every record, resolved advisor IDs, nonempty source citations, and absence of directed cycles. It reparsed all 505 cached MGP pages and checked advisor IDs, first degree year/institution, and names (including preserved original-name aliases) against the exported snapshot. Each page’s person links between its heading and its Student/Students section matched the parsed ancestor set. The importer now stops explicitly if an unfamiliar relationship label would silently omit such a link.

Two historical markup variations were caught and corrected: [George Howard Darwin](https://www.mathgenealogy.org/id.php?id=17467) labels Edward John Routh as **Tutor**; [Michael d. J. Walther](https://www.mathgenealogy.org/id.php?id=127962) has a **Doctoral advisor** field in addition to two ordinary Advisor fields. All are preserved. Darwin’s record has an explicit tutor note. The live Worker parser has the same handling and completeness guard; its deployed person cache was versioned to invalidate older parses.

The roster is the regular faculty section of [CMC’s department page](https://www.cmc.edu/mathematics/math-faculty), interpreted as tenured and tenure-track faculty, excluding the visiting and emeritus sections. Izbicki’s 2017 degree and Christian R. Shelton advisor relationship are verified in [his CMC-hosted CV](https://www.cmc.edu/sites/default/files/2024-06/IzbickiM2023CV.pdf). Preferred CMC names are displayed while original MGP names remain searchable aliases.

## Ancestors by faculty

Counts exclude the faculty member and count each reachable ancestor once, including co-advisor branches.

| Faculty | Distinct ancestors | Longest chain |
| --- | ---: | ---: |
| Asuman Aksoy | 175 | 51 |
| Sarah Cannon | 135 | 50 |
| Robert Cass | 272 | 54 |
| Lenny Fukshansky | 306 | 56 |
| Mark Huber | 10 | 10 |
| Michael Izbicki | 31 | 15 |
| Chiu-Yen Kao | 259 | 52 |
| Sam Nelson | 177 | 55 |
| Michael O’Neill | 161 | 50 |
| Evan Rosenman | 135 | 48 |
| R. Teal Witter | 189 | 57 |
| Helen Wong | 177 | 54 |

## Source limitations retained

Empty advisor lists mean “not documented in this source,” not “had no advisor.” Historical relationships are academic mentorship and can predate modern PhDs. Year/institution displays use the first listed degree entry; MGP sometimes lists several degrees, including non-doctoral qualifications. Source values have not been silently “corrected.”

Eight links have an advisor’s first listed degree year later than the student’s displayed first degree year. Several involve multiple degree entries; these are chronology flags for interpretation, not proof that a relationship is false:

| Student (first year) | Advisor (first year) |
| --- | --- |
| [Nikolai Dmitrievich Brashman](https://www.mathgenealogy.org/id.php?id=12541) (1834) | Joseph Johann von Littrow (1838) |
| [Georg Erhard Hamberger](https://www.mathgenealogy.org/id.php?id=125886) (1684) | Anton Bernhard Lauterbach (1716) |
| [Georg Erhard Hamberger](https://www.mathgenealogy.org/id.php?id=125886) (1684) | Johann Adolph Wedel (1694) |
| [Johannes Winter von Andernach](https://www.mathgenealogy.org/id.php?id=119159) (1527) | Jacobus (Jacques Dubois) Sylvius (1529) |
| [Daniel Sennert](https://www.mathgenealogy.org/id.php?id=126111) (1594) | Jacobus Martini (1596) |
| [Niccolò Leoniceno](https://www.mathgenealogy.org/id.php?id=127166) (1446) | Pietro Roccabonella (1459) |
| [Andreas Schato](https://www.mathgenealogy.org/id.php?id=127275) (1562) | Salomon Alberti (1564) |
| [Alexander Hegius](https://www.mathgenealogy.org/id.php?id=125898) (1463) | Rudolf Agricola (1478) |

Snapshot SHA-256:

`0cd7c82e85f9f8da6a98ea3e1a22e49a19f154838c30086f0e6d548aeff052d1`

Raw HTML remains in the local, Git-ignored `.cache/mgp/` directory. Refresh instructions are in [scripts/README.md](../scripts/README.md).
