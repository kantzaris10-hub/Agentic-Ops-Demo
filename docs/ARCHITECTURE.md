# Forge architecture and workflow reference

Forge is a Windows Electron desktop application used to prepare product content, images, properties and vehicle fitments, then execute operator-triggered actions in a Back Office system. The renderer manages input and review; the Electron main process owns browser automation, filesystem access and database reads. This implementation reference preserves the supplied component and workflow descriptions, with internal hostnames replaced by system roles.

The interactive Architecture tab replaces the former simplified reference diagram. It contains all 51 components, 69 connections and 11 workflows from the supplied implementation map. Internal hostnames are represented by their system roles.

Source snapshot: **2026-08-19**. File and line references refer to that internal source snapshot, not to the public demo code.

## Execution contexts

### Renderer

The Felper UI. Vanilla DOM in app/index.html + app/app.js. Reaches the main process only through window.felperElectron.

### Main process

Node.js side. Owns every BrowserWindow, all Chrome automation, the SQL read layer and the filesystem.

### Page context

Code that runs inside someone else's page — the Back Office admin application or the image management application — not in our renderer. Dashed because it is temporarily attached to a document we do not own.

### External

Systems outside this codebase: the BO stack, real Chrome, SQL Server, supplier sites.

## Implementation invariants

- Titles must be POSTed one language per request. A batched array only ever persisted EN.
- Nearly every write runs inside a the Back Office admin application page, because the session cookie only attaches from that origin.
- openBoAndFill (DOM injection) is the only path that persists attributes. The attributes batch tool loops through it deliberately.
- Injected scripts are IIFEs returning a Promise; the caller relies on awaitPromise. A non-async wrapper silently serialises to {} and makes every check pass.
- setReactValue writes through the native prototype setter. Assigning el.value directly is invisible to React.
- sleepNet is never scaled by speedFactor. The speed slider may only compress UI waits, never network floors.

## Traced workflows

### Fill BO — API pipeline

The current default write path. Everything goes through the correlator and bo-agg APIs from inside an authenticated page — no DOM driving at all.

Entry: `⚡ Fill Selected`

1. **Operator clicks ⚡ Fill Selected**. fillViaApiAction(), also bound to every .fill-via-api-btn across the tabs. (`app/app.js`:9436).
2. **Renderer assembles the payload**. Waits for any in-flight filter-use fetch first, then repacks into cms, articleHtml, properties, attributes and cse, gated by the section checkboxes. (`app/app.js`:8937).
3. **Crosses the context bridge**. felperElectron.cmsFillViaApi(boCode, data) — the renderer has no other way to reach Node. (`preload.js`:17).
4. **IPC router dispatches** (`main.js`:1387).
5. **fillCmsViaApi takes over** (`main.js`:3276).
6. **BO product page opens**. Waits for a GUID-shaped input, which is how it knows the product UID has rendered. (`main.js`:3303).
7. **Identity guards run before any write** — guard. Patch payloads must match the URL and clear a 50% title-word threshold, or the fill aborts rather than overwrite the wrong product. (`main.js`:3316).
8. **One inline script runs inside the page**. It runs there, not in Node, because the session cookie only attaches from the the Back Office admin application origin. (`main.js`:3332).
9. **Writes hit the correlator API**. Descriptions batch, but titles go one language per POST — a batched array only ever persisted EN. (`main.js`:3343).
10. **Articles upserted per language**. Then shared DNA articles, cached per session from a reference product. (`main.js`:3541).
11. **Log rendered back in the UI**. renderFillLog() — optionally followed by a category bind and a photo upload in the same run. (`app/app.js`:9544).

**Failure modes**

- **{ needsLogin: true } and nothing is written** — The persist:bo-session cookie expired, so the product URL redirected to the login page. Check: Open any BO window and log in once. The session is shared by every window on that partition, so one login fixes all paths. Reference: `main.js:3304`.
- **{ mismatch: true } — the fill refuses to run** — The title-word guard found under 50% of the expected title words on the loaded page. Usually the BO code and the pasted content belong to different products. Check: Confirm the bo_code in the JSON matches the product you meant. This guard exists because a live product was once overwritten. Reference: `main.js:3316`.
- **Only EN titles land, other languages silently missing** — Titles were posted as a batched array instead of one request per language. Check: The per-language POST loop must stay a loop. Never 'optimise' it into a single batched call. Reference: `main.js:3396`.
- **Titles or subtitles come back blank on one side** — Only one of title/subtitle was supplied for a language, and the live re-read of the CMS tab failed, so posting would have blanked the other side. Check: The code deliberately skips the POST in this case. Supply both sides, or check that the CMS Setup tab rendered. Reference: `main.js:3389`.
- **Attributes appear unchanged after a successful run** — The API path does write attributes, but keyword/video edits made only in the UI cards are not in the payload unless the Attributes checkbox is ticked. Check: Tick Attributes in the Advanced panel, or use the EDIT tab attributes batch tool, which routes through the DOM path. Reference: `app/app.js:9459`.

### Fill BO — DOM injection

The older path that drives the real React UI. Still the only route that persists attributes, so the attributes batch tool loops through it deliberately.

Entry: `openBoAndFill`

1. **Batch or retry action fires**. Also reached from Retry Last Fill, the CSE batch, the EDIT patch runner and the batch-CMS navigator. (`app/app.js`:11043).
2. **Payload gains its section allowlist**. _sections decides which of cms, properties, cse, attributes and articleCreate run. (`app/app.js`:9068).
3. **IPC open-bo-and-fill** (`main.js`:1383).
4. **openBoAndFill opens the product** (`main.js`:3018).
5. **Window loads and clears four guards** — guard. Title-word match, login redirect, URL identity, then a wait for the React tab list to exist. (`main.js`:3067).
6. **Prelude prepended**. setReactValue writes through the native prototype setter — assigning el.value directly is invisible to React. (`main.js`:3121).
7. **bo-fill.js injected and awaited**. The script is an IIFE returning a Promise; the caller relies on awaitPromise. (`main.js`:3124).
8. **It drives the real UI**. Fills a cell, then sends Tab — BO's own keydown handler is what saves. (`app/bo-fill.js`:257).
9. **Trusted keys come back through IPC**. A synthetic key event does not satisfy PrimeVue, so the page asks the main process to send a real one. (`bo-preload.js`:4).
10. **Article URL captured, phase 2 follows**. window.open, pushState and replaceState are monkey-patched to capture the URL without spawning a tab, then all three are restored. (`app/bo-fill.js`:149).

**Failure modes**

- **Fill finishes instantly with filled: 0** — The React tab list never appeared within 15s, so no section could be located. Check: The BO page is slow or partially rendered. Reload the product page manually and retry. Reference: `main.js:3100`.
- **Some values are typed but not saved** — The Tab keydown that triggers BO's auto-save did not register as trusted. Check: Confirm bo-preload.js is still set as the window's preload — felperBo.pressTab() is what makes the key event real. Reference: `app/bo-fill.js:257`.
- **Dropdown picks the wrong item** — The dropdown filter only engages above six items, and the search term is truncated to the first three alphanumerics (K&N becomes K). Check: Verify the intended option against the match ladder before assuming the value was wrong in the payload. Reference: `app/bo-fill.js:537`.
- **Everything is slower or flakier after changing the speed slider** — speedFactor scales the micro and UI sleeps only. If a network wait was scaled by mistake, requests get cut off. Check: sleepNet must stay unscaled. Never multiply it by speedFactor. Reference: `app/bo-fill.js:12`.
- **A second browser tab opens during the fill** — The window.open monkey-patch was not restored, or an exception skipped the restore. Check: window.open, pushState and replaceState must all be restored on every exit path. Reference: `app/bo-fill.js:172`.

### Phase 2 — article in 6 languages

Writes the article body into TinyMCE once per language. The trickiest injection in the codebase, and the one with the most defensive machinery.

Entry: `fillArticlesPhase2`

1. **Phase 1 returns an articleEditUrl**. Captured from the '+ New Article' button without letting a real tab open. (`app/bo-fill.js`:187).
2. **Same window navigates to the editor**. Relative URL resolved against the Back Office admin application; login redirects detected explicitly. (`main.js`:3724).
3. **Waits for TinyMCE to truly initialise** — guard. Polls up to 30s for #Name, the editor container and activeEditor.initialized — three conditions, because any one alone lies. (`main.js`:3749).
4. **bo-article-fill.js injected in an async wrapper**. bo-shared is deliberately not prepended here; this script inlines its own setters. (`main.js`:3784).
5. **Language switched via React onClick**. A plain .click() does not update the controlled dropdown state, so the prop is invoked directly. (`app/bo-article-fill.js`:131).
6. **Editor reinitialises, script waits again** — guard. BO replaces the TinyMCE instance on every language switch. (`app/bo-article-fill.js`:144).
7. **Content set, then saved past the disabled state**. The Save button's React onClick is called directly, which bypasses the disabled attribute entirely. (`app/bo-article-fill.js`:354).
8. **Whole phase races a 120s hard timeout** — guard. did-navigate-in-page is deliberately not used as the completion signal — BO fires it on every language switch, which would resolve after one language. (`main.js`:3809).

**Failure modes**

- **Only the EN article is written, the rest are missing** — Completion was signalled by a navigation event that BO fires on the first language switch. Check: The phase must be bounded by the injected script's own Promise plus the 120s race — never by did-navigate-in-page. Reference: `main.js:3803`.
- **Article body is empty but the save succeeded** — TinyMCE was replaced after the language switch and setContent hit the stale editor instance. Check: The 15s reinit poll must complete before writing. Confirm activeEditor.initialized is true. Reference: `app/bo-article-fill.js:144`.
- **Save button stays greyed out and nothing persists** — The button is React-controlled; removing the disabled attribute alone does not fire the handler. Check: Save via the __reactProps onClick path. The DOM-click fallback is only a last resort. Reference: `app/bo-article-fill.js:354`.
- **Phase 2 never starts** — Phase 1 did not capture an articleEditUrl, so there was nothing to navigate to. Check: The '+ New Article' button must exist on the CMS tab, and the articleCreate section must be enabled in _sections. Reference: `app/bo-fill.js:149`.

### ERP description lookup

Three escalating levels behind a single call. Level 3 teaches the app the API URL template, which promotes every later code to level 2 — roughly 200ms instead of a full page load.

Entry: `fetch-bo-erp-desc`

1. **Operator types a BO code**. Debounced 400ms; the prefix alone already picks oil or generic mode. (`app/app.js`:591).
2. **IPC fetch-bo-erp-desc** (`preload.js`:51).
3. **Level 1 — 10-minute memory cache**. Returns instantly with no window and no network. (`main.js`:228).
4. **Level 2 — learned API template**. One fetch inside the already-authenticated hidden window. On a miss the template is invalidated and it falls through. (`main.js`:239).
5. **Level 3 — CDP listener attached first** — guard. It must be attached before loadURL, or the dimensions response has already gone by. (`main.js`:262).
6. **Page loads with window.fetch monkey-patched**. Every response is cloned and searched for a key matching /^erp.?desc/i; a DOM TreeWalker is the fallback. (`main.js`:293).
7. **The API URL is turned into a template**. The code is replaced with a placeholder — this single line is what makes every subsequent lookup fast. (`main.js`:349).
8. **Result drives automatic mode selection**. detectModeFromErpDesc picks oil, air or car; a vehicleType of car upgrades air to car; unclassifiable falls back to generic. (`app/app.js`:9711).

**Failure modes**

- **'ERP Description not found — make sure you are logged in to BO'** — Neither the fetch interceptor nor the DOM fallback found a description within 15s. Check: Log in to BO once in any window. If already logged in, the product may genuinely have no ERP description. Reference: `main.js:338`.
- **Dimensions are missing but the description arrives** — The dimensions race timed out at 5s, so the description is returned without them by design. Check: Expected on a slow response. Re-running the lookup usually fills dimensions from the cache. Reference: `main.js:341`.
- **Every lookup is slow again after being fast** — The learned API template was invalidated by a miss and the app fell back to level 3 page loads. Check: One successful level-3 load relearns the template. Persistent slowness means the BO API URL shape changed. Reference: `main.js:251`.
- **The mode switches to the wrong product family** — detectModeFromErpDesc classified the description differently, or vehicleType upgraded air to car. Check: Set the mode manually. Batch mode is never auto-left. Reference: `app/app.js:7373`.

### Fill via the operator's real Chrome

The same phase-1 script, executed in the operator's own browser over CDP. Exists because their real profile is already logged in everywhere.

Entry: `fillBoInChrome`

1. **Renderer requests the Chrome path**. Currently unreferenced from the UI — the button was re-pointed at the API pipeline. (`preload.js`:48).
2. **Probe ports 9222–9225** (`main.js`:2903).
3. **Kill Chrome if it is running without the port**. A live profile lock makes Chrome silently ignore --remote-debugging-port, so there is no gentler option. (`main.js`:2918).
4. **Relaunch against the real User Data directory**. Polls the port for up to 20 seconds. (`main.js`:2929).
5. **Find or open the product tab** (`cdp-client.js`:246).
6. **Connect over a hand-rolled WebSocket** — guard. The URL is rewritten from localhost to 127.0.0.1: Windows resolves localhost to ::1, but Chrome listens only on IPv4. (`cdp-client.js`:89).
7. **Same script, evaluated with awaitPromise**. Five-minute timeout. There is no phase 2 on this path — articles are not filled. (`main.js`:2998).
8. **Script drives the page** (`app/bo-fill.js`:71).

**Failure modes**

- **'Chrome is already running without remote debugging'** — launchChromeForBo refuses to kill Chrome; only fillBoInChrome does that. Check: Close Chrome completely, including background tasks, then retry. Reference: `main.js:2875`.
- **CDP call timeout on every command** — The WebSocket URL resolved to IPv6 ::1 while Chrome listens only on IPv4. Check: The localhost to 127.0.0.1 rewrite must stay. Removing it breaks CDP on Windows entirely. Reference: `cdp-client.js:89`.
- **Fill works but articles are never written** — This transport has no phase 2 by design. Check: Use the Electron window path or the API pipeline when articles are needed. Reference: `main.js:2998`.
- **Chrome reopens with a fresh, logged-out profile** — The --user-data-dir argument did not resolve to the operator's real profile. Check: Confirm %LOCALAPPDATA%/Google/Chrome/User Data exists. The whole point of this path is the existing login. Reference: `main.js:2926`.

### Photo upload — fast API path

Skips opening the product in IMG Tool entirely. Faster, but that also means the already-has-photos guard cannot apply — so the identity guards before it carry all the weight.

Entry: `upload-to-imgtool-api-fast`

1. **Operator starts the upload queue**. The queue is pausable and resumable; a login failure halts it while preserving the position. (`app/app.js`:4366).
2. **BO product page opened to read the UID** (`main.js`:1013).
3. **Two identity guards before anything is written** — guard. The loaded URL must still contain the code, and the page text plus every input value must contain it too. Both were added after a live product was overwritten. (`main.js`:1021).
4. **Product UID read from the GUID-shaped input** (`main.js`:1039).
5. **IMG Tool window opened** (`main.js`:1045).
6. **Each image posted twice**. A multipart upload, then a JSON record carrying uid, colour and eight output sizes. Colour encodes whether it is a base main, a base alt, or a series variation. (`main.js`:1071).
7. **Series variations get a main image each**. The dimension list comes from the correlator, keyed by Dim1. (`main.js`:1099).
8. **Variation alts assigned by reference**. Existing CDN URLs are referenced rather than re-uploaded — re-uploading would duplicate them into the general pool. (`main.js`:983).
9. **Upload logged to disk** (`main.js`:964).

**Failure modes**

- **abort-url-mismatch or abort-page-mismatch in the log** — The loaded BO page no longer matched the requested code, so the upload refused to continue. Check: This guard is working as intended. Re-run the single code and watch which product actually loads. Reference: `main.js:1021`.
- **Photos overwrote a product that already had them** — The fast path never opens the product in IMG Tool, so the already-has-photos guard cannot run. Check: Use the normal (non-fast) upload when overwriting is a risk. Fast is for known-empty products. Reference: `main.js:1000`.
- **Variation photos duplicated into the general pool** — Variation alts were re-uploaded through the resize endpoint instead of referenced by existing CDN URL. Check: Variation alts must be assigned by reference with colour set to Dim1. Reference: `main.js:983`.
- **Queue stops partway with needsLogin** — The IMG Tool or BO session expired mid-run. Check: Log in, then press Continue — the queue position was preserved, so completed products are not redone. Reference: `app/app.js:4377`.

### Scrape → process → upload photos

Finding product photos on supplier sites, squaring and cleaning them locally, then pushing them into IMG Tool. The match logic is deliberately strict.

Entry: `Image Importer`

1. **Operator picks a source and pastes code pairs**. BO code and supplier code per line, with a jittered 3–7 second throttle between products. (`app/app.js`:4124).
2. **Scraper searches the supplier** (`main.js`:2488).
3. **A window opens without stealing focus**. showInactive, so the operator can still solve a Cloudflare challenge by hand. (`main.js`:2309).
4. **Confident match, or nothing** — guard. Codes under four alphanumerics are rejected, and the slug must contain a delimited in-order token match. It never falls back to the first link. (`main.js`:2549).
5. **Images downloaded with the source's own Referer**. AutoDoc images are upscaled by probing the CDN size parameter and measuring naturalWidth in-page. (`main.js`:2335).
6. **Squared and cleaned locally**. pica resample to a 1000px canvas with a 900px content box, flood-fill background to white, JPEG at quality 0.95. (`app/app.js`:3957).
7. **Written per product code** (`main.js`:2373).
8. **Uploaded, then verified and repaired**. A separate read-only verify pass counts mains and alts, and the fix pass re-uploads only the shortfall. (`app/app.js`:4443).

**Failure modes**

- **status 'rejected' and no images for a code** — The supplier slug did not clear the confident-match test, or the code was under four alphanumerics. Check: Intentional. Find the product manually and use the single-code lookup or drag the photos in. Reference: `main.js:2549`.
- **Every product returns nothing, suddenly** — A Cloudflare challenge is blocking the scrape window. Check: The window is visible but never focused — bring it up and solve the challenge, then resume. Reference: `main.js:2309`.
- **AutoDoc images are low resolution** — The upscale probe fell back to the thumbnail because no larger variant measured bigger. Check: Expected for some products. Verify against the source page before assuming a bug. Reference: `main.js:2631`.
- **status 'manual_check'** — Images were found and saved, but the main image did not meet the expected pixel size. Check: Open the code in the importer, inspect the frames, and fix or re-fetch from another source. Reference: `app/app.js:3978`.

### Batch CMS run

The high-volume path: many products from one Excel or AI-generated JSON, run in sequence with live progress and a resumable saved record.

Entry: `batch mode`

1. **Switch to batch mode**. The mode sets a data attribute on body; CSS does the rest. The title field and mode toggle physically relocate. (`app/app.js`:1818).
2. **Rows entered, imported, or pasted as JSON**. Excel parsing is hand-rolled — zip reading, inflate via DecompressionStream, XML parse. No library. (`app/app.js`:10871).
3. **Validated and seeded into a saved run**. The batch dashboard record lives in IndexedDB; only a light index sits in localStorage. (`app/app.js`:9954).
4. **Reviewed product by product in the CMS tab**. A navigator replaces the normal copy-card grids in batch mode. (`app/app.js`:10486).
5. **Run all, via API or via injection** (`app/app.js`:11151).
6. **Each product filled in turn**. _isBatch suppresses the title-mismatch guard, since batch titles are supplied rather than derived. (`main.js`:3276).
7. **Every step reported into the dashboard**. dashMark() is the universal report-in hook — CMS, CSE, images and bind all funnel through it. (`app/app.js`:9984).
8. **Verified, then repaired**. The fix pass re-fills and re-verifies in place, moving products between the issue and clean lists live. (`app/app.js`:11277).
9. **Resumable from History**. Loading a saved run and resuming skips products whose CMS is already marked done. (`app/app.js`:10101).

**Failure modes**

- **A wrong product got filled during a batch** — _isBatch suppresses the title-word guard, because batch titles are supplied rather than derived from the page. Check: The bo_code column is the only identity check in batch mode. Validate the sheet before running, not after. Reference: `main.js:3067`.
- **Run stops early with no error** — The stop flag was set, or a product returned needsLogin which halts the loop. Check: Check the results log for the last code, log in, then resume from History — completed products are skipped. Reference: `app/app.js:11151`.
- **Excel import produces zero products** — The sheet matched neither the tall nor the wide layout. Check: Download the template and compare headers. The parser is hand-rolled and header-driven. Reference: `app/app.js:10727`.
- **Progress looks stalled on one code** — A single fill is waiting on a network floor or a 45s page-load timeout. Check: Expected for slow products. The live ETA accounts for it; only intervene if it exceeds the timeout. Reference: `main.js:3055`.

### EDIT tab batch tools

Six one-off tools that write across many products. The FAQ writer is the most dangerous, because a category extras write replaces the whole record.

Entry: `Clone Articles · Category FAQ`

1. **Operator pastes a spec or FAQ array**. Clone Articles takes {from, to, names[]}; Category FAQ takes [{iso, question, answer}]. (`app/index.html`:908).
2. **A pure module parses and guards it** — guard. parseCloneSpec refuses a spec where from equals to, because that would overwrite the source. (`app/bo-batch-payloads.js`:31).
3. **Preview first — dry run writes nothing**. Both tools have a preview mode that reports what would change, including whether the target already exists. (`app/app.js`:9256).
4. **IPC into the batch handlers** (`app/app.js`:9145).
5. **The same pure module is required in main**. One module, three consumers: renderer, main process and the test suite. That is why its guards cannot drift. (`main.js`:14).
6. **One navigation, then in-page fetches**. Navigate once to establish the session origin, then loop over every code without renavigating. (`main.js`:1522).
7. **Optimistic-concurrency guard on FAQ write** — guard. The write is refused if the FAQ count or the EN question of the target slot has drifted since it was loaded. (`app/bo-batch-payloads.js`:117).
8. **Rows posted, then read back and diffed**. After writing, the whole extras record is re-read and compared so collateral damage to other slots is visible. (`main.js`:1893).

**Failure modes**

- **'that would overwrite the source' on a clone** — The from and to prefixes are identical. Check: Working as intended. Give the clone a distinct target prefix. Reference: `app/bo-batch-payloads.js:31`.
- **FAQ write refused with a count or question mismatch** — The category's extras record changed between Load and Write. Check: Press Load again to refresh the slots, then re-apply. Never bypass this guard — the write replaces the entire record. Reference: `app/bo-batch-payloads.js:122`.
- **Other FAQ slots changed after a write** — The whole extras record is replaced on write, so a stale in-memory copy silently reverts siblings. Check: Read the post-write diff in the log. It exists precisely to surface this. Reference: `main.js:1893`.
- **'TARGET EXISTS' and nothing is written** — The destination article already exists and overwrite was not set in the spec. Check: Confirm you mean to replace it, then add overwrite to the spec. Reference: `main.js:1813`.

### Verify and fix

Reads live BO values back and compares them to what should be there. Independent of the fill path by design, so a bug can only misreport, never overwrite.

Entry: `verify-bo-product`

1. **Verify all pressed** (`app/app.js`:11218).
2. **Debug log cleared first** (`main.js`:2240).
3. **Product page loaded read-only** (`main.js`:3637).
4. **bo-verify.js injected in an async wrapper** — guard. The async wrapper is load-bearing: a plain one serialised the unresolved Promise to an empty object and made every check falsely pass. (`main.js`:3665).
5. **Values clicked, read, and escaped**. Same traversal as the fill, but Escape instead of Tab, so nothing is committed. (`app/bo-verify.js`:37).
6. **Identity cross-checked from BASIC INFO** — guard. Reads the Part No. independently of the URL. (`app/bo-verify.js`:45).
7. **Report written and rendered** (`main.js`:3692).
8. **Fix pass re-fills only what failed** (`app/app.js`:11401).

**Failure modes**

- **Everything passes, including things you know are wrong** — The injected verify script resolved to an empty object because its wrapper was not async. Check: The classic failure here. The wrapper must be async and must await the inner Promise. Reference: `main.js:3661`.
- **Verify reports issues that are actually correct** — Expected values came from the payload, not the page, so formatting differences read as mismatches. Check: Compare against the live page before running a fix pass. Verify can misreport but never writes. Reference: `app/app.js:11263`.
- **Report window is empty or stale** — verify-report.html is overwritten each run and verify-debug.log is truncatable. Check: Re-run the verify. Neither artefact is a durable ledger. Reference: `main.js:2240`.

### BO Auditor — read-only SQL

The newest subsystem and the only one that touches the database. Read-only by construction, and the renderer never sees SQL or credentials.

Entry: `auditor-run`

1. **Connection probed**. A trivial SELECT 1, so a misconfiguration surfaces before a long run. (`app/app.js`:12544).
2. **Run requested with checks and brand filter**. A re-entrancy guard prevents two concurrent audits. (`main.js`:2102).
3. **Auditor pulls the catalogue** (`bo-auditor.js`:37).
4. **Two SELECTs, joined in JavaScript**. Joined in JS rather than SQL to dodge a Greek/Latin1 collation conflict between the two tables. (`bo-db.js`:122).
5. **Read-only enforced in code, not just by intent** — guard. readOnlyIntent on the connection, and assertReadOnly rejects anything that is not a single SELECT or WITH, including stacked statements. (`bo-db.js`:76).
6. **Brand derived per product, then check A1 runs**. A1 is part-number and title integrity — corruption, neighbour-copy, foreign part numbers. A2 through A7 are placeholders. (`bo-auditor.js`:52).
7. **Progress streamed to the UI** (`main.js`:2106).
8. **Findings filtered, sorted, exported**. The table caps at 2,000 DOM rows; CSV export carries the full set. (`app/app.js`:12667).

**Failure modes**

- **Probe fails with a connection error** — MSSQL_* environment variables are missing or the .env file was not loaded. Check: Credentials come only from process.env in the main process. The renderer never has them. Reference: `bo-db.js:15`.
- **A query is rejected before it runs** — assertReadOnly refused it — not a single SELECT or WITH, or it contained stacked statements. Check: Working as intended. This layer is read-only by construction and must stay that way. Reference: `bo-db.js:76`.
- **Results look truncated** — The table renders at most 2,000 DOM rows. Check: Export the CSV — it carries every finding. Reference: `app/app.js:12667`.
- **Only check A1 is available** — A2 through A7 are disabled placeholders in the UI. Check: Expected. The auditor is a scaffold with one implemented check. Reference: `app/index.html:1072`.

## Interpretation limits

This is an implementation reference supplied for the portfolio, not a fresh audit of the private source. Descriptions of successful persistence and read-only enforcement should be interpreted within the stated source snapshot. In particular, the reference distinguishes an API write attempt from the DOM path described as persisting attributes, and database read intent plus query guards from database-account permissions.

The public runnable demo continues to execute synthetic operations through simulated adapters. The reference map documents the production workflow lineage rather than claiming that every production subsystem is implemented in this demo.
