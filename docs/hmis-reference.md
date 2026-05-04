# HMIS Autopilot — Operational Reference

> Single source of truth for HMIS page structure, selectors, automation strategy, and known issues.
> Last verified: May 4, 2026 against live patient **TEHREEM AKHTAR** (`/doctor/add/94071777/112021`).

---

## 1. Login Flow (`/login`)

### Inputs
| Element | Selector | Notes |
|---|---|---|
| Hospital | `#hospitalId` | Value `19` = Lahore General Hospital |
| Username | `#username` | |
| Password | `#password` | |
| Captcha Num1 | `input[name="num1"]` | |
| Captcha Num2 | `input[name="num2"]` | |
| Captcha Answer | `input[name="user_answer"]` | |
| Submit | `button[type="submit"]` | |
| Error Banner | `.alert.alert-danger, .alert.alert-warning, .text-danger` | Detect "already logged in" loops |

### Automated Action
The script parses `num1` and `num2`, assumes addition, injects into `user_answer`, fills credentials, and clicks submit. A `loginAttempts` counter in session storage (capped at 3) prevents infinite loops.

> [!WARNING]
> Captcha solver assumes addition but HMIS sometimes uses subtraction. Parse the operator from the DOM label text between `num1` and `num2`.

---

## 2. Department & Role Selection (`/login/settings`)

| Element | Selector | Notes |
|---|---|---|
| Department Dropdown | `select[wire\:model.defer="departmentId"]` | Value `1` = OPD |
| Clinic Dropdown | `select[wire\:model.defer="clinicId"]` | Value `1503` = Interventional Radiology |
| Submit | `button[wire\:click="loadDepartment"]` | Text: "Next >>" |
| Role Switcher | `.login-roles-list .dropdown-toggle` | Check text for "OPD" |

### Bug Fix: Setup Loop
Detecting page context solely by DOM elements causes loops. Use **path-based detection** (`/token/`) plus a **session lock** (`setupCompleted`). Once set, the extension stops re-triggering setup.

---

## 3. Token Queue (`/token/today`) — ✅ Verified Live

### Page Layout
- Header: Doctor name, MRN search, Token search, Token call button
- Left sidebar: Today's Token, Today's Patient, Visit Report, Resume Token, Schedule Patient, Reset Token, Today All Patients
- Main content: "TOKEN LISTING" → filter cards (Male, Female, Senior Citizen, Handicap) → Patient table

### Table Structure
- Classes: `table table-striped jambo_table bulk_action`
- Container: `.right_col table tbody`
- 10 columns: Sr#, Token, Patient Name, MR Number, Referred By, Referred Status, Age, Current Location, Referring Hospital (External Patient), Action

### Patient Row (3 clickable links per row)
```html
<a class="btn-token tokenButton" href=".../doctor/add/{sessionId}/{tokenId}" id="tokenPatButton_{id}">PATIENT NAME</a>
<a class="btn-token tokenButton" href="..." id="tokenMrnButton_{id}">MRN</a>
<a class="btn-token tokenButton" href="..." id="tokenArrowButton_{id}"><i class="fa fa-arrow-right"></i></a>
```

### Selectors

| Selector | Status | Used For |
|---|---|---|
| `.right_col table tbody` | ✅ Works | Patient table container |
| `a[id^="tokenPatButton_"]` | ✅ Works | Click to open patient encounter |
| `a[id^="tokenArrowButton_"]` | ✅ Works | Arrow button (same action) |
| `.dataTables_empty` | ✅ Works | Empty queue: `<td colspan="11" class="dataTables_empty">No result found</td>` |
| `table.table-striped` | ✅ Works | Table element |
| `button[wire:click="getTokenData"]` | ❌ **NOT FOUND** | Refresh — element doesn't exist; falls back to `window.location.reload()` |

---

## 4. Patient Encounter — Summary Tab — ✅ Verified Live (2026-05-04)

### Page Layout
- **Top bar**: Patient Information + "Release Patient Token" (blue btn) + "Check Out" (green btn)
- **Left sidebar**: Summary, Complaints, Diagnosis, Order, Notes, Vitals, Allergies, Vaccination, History, Attachments, Referrals
- **Main content**: Summary cards in 2-column `col-md-6` grid

### Patient Info Bar
```
Patient Information
Name: SHAFIA M RIZWAN | Contact: 0300-6566007 | Age: 46y, 2m, 19d | MRN: 19202644951180 | CNIC: 33302-8004863-4 | Visit:5 | Token: F-1387
```
> [!CAUTION]
> **Patient info selectors are broken.** `.patient-name` and `#mrn` do NOT exist. Info is a flat text bar with "Name:", "MRN:" labels. Must parse with regex instead.

### Summary Extraction — DOM Structure (Verified 2026-05-04 TEHREEM AKHTAR)

Each section is a `.col-md-6` div. The section title is either the **first line of `innerText`** or is inside a `<strong>` tag. Items are **newline-separated plain text** — NOT wrapped in `<p>` or `<li>`.

**Diagnosis section `innerText` example:**
```
Diagnosis
Provisional
Localized swelling, mass and lump, unspecified
Provisional
Benign neoplasm of left breast
```

**Radiology section `innerText` example:**
```
Radiology
USG Guided Biopsy001000000000XXXXX
USG Swelling001000000000XXXXX
```

**Pathology section `innerText` example:**
```
Pathology
Anti HIV by Elisa001000000000T86720
| Special Serum
```

> [!IMPORTANT]
> **Extraction method:** Read `.col-md-6` elements with `el.innerText.split('\n')`. Line 0 (or first line matching a known section name) is the **header**. Subsequent lines are items. "Provisional"/"Final" labels appear on their OWN line before each diagnosis name — use a state-machine parser (see `summary-extractor.ts`).

> [!IMPORTANT]
> **CPT code cleaning:** HMIS appends long numeric/alphanumeric codes DIRECTLY to item text with NO space: `USG Guided Biopsy001000000000XXXXX`. Strip with regex `\)?[\dA-Z]{10,18}\s*$`.

### Summary Selectors

| Selector | Status | Notes |
|---|---|---|
| `.col-md-6` | ✅ Primary | Read with `el.innerText.split('\n')` — first line is section title |
| `.card, .panel, .section` | ❌ Wrong | Sections are NOT `.card` or `.panel` elements |
| `h4, h5, h6, strong` | ✅ Fallback | Section title may also appear inside a `<strong>` tag |
| `p, li, .item-text` | ❌ Wrong | Items are plain text nodes, not `<p>`/`<li>` elements |
| `.btn-patient-checkout` | ✅ Works | `<button class="btn btn-teal btn-patient-checkout">Check Out</button>` |
| `a[href*="resetTokenHomeButton"]` | ✅ Works | `<a href=".../resetTokenHomeButton/{id}">Release Patient Token</a>` |
| `.btn-release-token` | ❌ Not found | Dead fallback — first selector works |

### Sidebar Navigation

| Selector | Status | Notes |
|---|---|---|
| `a[href*="summary"]` | ❌ **FAILS** | Links use `href="javascript:void(0)"` with `wire:click` |
| `a[href*="diagnosis"]` | ❌ **FAILS** | Same |
| `a[href*="order"]` | ❌ **FAILS** | Same |
| `li:nth-child(N) a.nav-link` | ❌ Risky | Positional + may not use `.nav-link` class |
| `findByText('a', 'Summary')` etc. | ✅ **Works** | Text labels are reliable: "Summary", "Diagnosis", "Order" |

> [!CAUTION]
> **ALL `href*=` sidebar selectors fail.** The extension's `navigateToTab()` must rely on `findByText()` fallback. The primary CSS selectors in `SIDE_MENU` are dead code.

---

## 4b. Checkout Flow — ✅ Verified Live (2026-05-04, TEHREEM AKHTAR)

### Checkout Button
- **Selector:** `.btn-patient-checkout`
- **HTML:** `<button class="btn btn-teal btn-patient-checkout">Check Out</button>`
- **Location:** Top-right of patient page, inside the patient info bar area

### Checkout Prerequisite
> [!CAUTION]
> HMIS **validates** before showing any popup. If no diagnosis has been entered in the current visit, checkout is **blocked** with a red toast/error:
> `"Please fill data against Diagnosis section."`
> In this case, NO SweetAlert2 popup appears. The extension detects this toast and throws an error, triggering token release.

### SweetAlert2 Confirmation Popup (appears on valid checkout attempt)
```
Title:   "Are you sure?"
Body:    (empty or short message)
Button 1 (Confirm): text="Yes"  class=.swal2-confirm  (green)
Button 2 (Cancel):  text="No"   class=.swal2-cancel   (red)
```

### Checkout Selectors

| Element | Selector | Status |
|---|---|---|
| Checkout button | `.btn-patient-checkout` | ✅ Works |
| SweetAlert2 popup container | `.swal2-container`, `.swal2-popup` | ✅ Works |
| Confirm button ("Yes") | `.swal2-confirm` | ✅ Works |
| Cancel button ("No") | `.swal2-cancel` | ✅ Works |
| Validation error toast | `.toast-error`, `.alert-danger` | ✅ Works |

### Post-Checkout Navigation
After clicking `.swal2-confirm`, HMIS automatically redirects to `/token/today`. The extension does not need to manually redirect.

### Release Patient Token (error fallback, no checkout)
- **Selector:** `a[href*="resetTokenHomeButton"]`
- **No popup** — clicking directly navigates to `/token/today`
- Use when checkout fails/is blocked (e.g. no diagnosis entered)

---


### Layout
- Left: Form (Type + Search + Save) + existing diagnoses table
- Right: "Patient Summary" sidebar (miniature summary, same data)

### Form Selectors

| Element | Selector | Status |
|---|---|---|
| Type dropdown | `select.sl_template1` | ✅ Works — shows "Provisional" |
| Search input | `input.form-input.sl_template2[placeholder="Search Diagnosis..."]` | ✅ Works |
| Search results | `a.list-item` | ⬜ Untested (results not triggered) |
| Save button | `button.btn-teal2` | ✅ Works — green "Save" |

### Search & Select Workflow
1. Click search input → type query
2. **Press Enter** to trigger Livewire search (critical — just typing isn't enough)
3. Select from `a.list-item` dropdown results
4. Click Save (`button.btn-teal2`)

### Duplicate Detection
Existing diagnoses table: `.table-striped tbody tr` or `#diagnosis-component table tbody tr`. Check `row.textContent` for the query string. ✅ Works.

### Existing Diagnoses (this patient)
| Type | Name | Added By |
|---|---|---|
| Provisional | Mastitis without abscess | Dr Waqas Ahmad Surgery |
| Provisional | Acute pain due to trauma | Dr Waqas Ahmad Surgery |

---

## 6. Order → Investigation Tab — ✅ Verified Live

### Layout
- Sub-tabs: Medication, **Investigation** (active), Immunization, Follow Up, Admission Order
- Form: External checkbox + CPT search + Specimen dropdown + Remarks + Save
- Right: Same "Patient Summary" sidebar

### Form Selectors

| Element | Selector | Status |
|---|---|---|
| Investigation sub-tab | `#order-investigation-tab` | ✅ Works |
| Search CPT input | `input.form-input.sl_template2[placeholder="Search CPT..."]` | ✅ Works |
| Search results | `a.list-item` | ⬜ Untested |
| Save button | `button.btn-teal2` | ✅ Works |

### Existing Orders (this patient)
| Dept | Service | Status |
|---|---|---|
| Radiology | USG FNAC (Fine Needle Aspiration Cytology) | Pending |
| Radiology | CT Scan Films Charges | Pending |
| Radiology | Mammogram (Bilateral) | Pending |
| Radiology | CT Chest Abdomen & Pelvis With Contrast | Image/View |
| Pathology | CBC, RFTs, LFTs, HBsAg, Anti HCV, Anti HIV | View Report |

### Key Observation
CPT search had **"USG Swelling"** pre-filled — the clinical rules engine mapped `swelling → USG Swelling`. But the actual investigation is "USG FNAC". This is a rules mismatch when Scenario A should have been used (both diagnosis + investigation present).

---

## 7. Livewire Interaction Strategy

### Setting Input Values
Simply changing `element.value` doesn't work. Must dispatch events:
```javascript
element.value = "X";
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));
```

### Waiting for Livewire
Check for loading indicators: `[wire:loading]`, `#wireLoadingBar`, `.livewire-loading`. Filter to visible-only (`offsetParent !== null`). Poll every 150ms with timeout.

### Error Recovery
| Action | Selector |
|---|---|
| Release token (go home) | `a[href*="resetTokenHomeButton"]` |
| Checkout patient | `.btn-patient-checkout` |

---

## 8. MV3 Technical Notes

### `chrome.storage.session` Access
Content scripts cannot access `chrome.storage.session` by default. Background must grant:
```javascript
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
```

### Start/Stop Race Condition
Use a `setRunning()` helper that updates state and broadcasts **before** any status logs to prevent the "Start" button resetting itself.

### Token Page Empty State
```html
<td colspan="11" class="dataTables_empty">No result found</td>
```

### Role Detection
The active role text in `.login-roles-list .dropdown-toggle` is the most reliable way to check context.

---

## 9. All Issues & Fixes

### 🔴 P0 — Broken

| # | Issue | Fix |
|---|---|---|
| 1 | Sidebar `href*=` selectors fail (links use `javascript:void(0)`) | Remove `href*=` selectors; use `findByText()` as primary |
| 2 | Radiology text regex fails (digits glued to text, no space) | Change regex to `\)?\d{10,18}\s*$` |
| 3 | Patient info selectors (`.patient-name`, `#mrn`) don't exist | Parse from info bar text: `Name:\s*([^|]+)`, `MRN:\s*(\d+)` |

### 🟡 P1 — Degraded

| # | Issue | Fix |
|---|---|---|
| 4 | Summary cards use `col-md-6`, not `.card` | Add `col-md-6` to `SUMMARY.CARDS` selector |
| 5 | Refresh button selector wrong | Use fallback or find correct element |
| 6 | `.btn-release-token` doesn't exist | Remove dead selector (first selector works) |
| 7 | Rules engine may suggest wrong investigation in Scenario A | Ensure Scenario A is reached when both diagnosis + investigation exist |

### 🟢 P2 — Working

Token queue links, checkout button, release token, diagnosis form, investigation form, investigation sub-tab, `findByText()`, Livewire events, empty queue detection — all confirmed working.
