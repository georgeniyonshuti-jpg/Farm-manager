# Flock Management — Feature Prompt for Cursor Agent

> Paste this prompt into Cursor Agent to implement the features below.
> Before pasting, add one line at the top pointing to your relevant files, e.g.:
> *"The flock model is in `models/flock.js`, the flock list is in `components/FlockList.jsx`, and roles are in `context/AuthContext.js`."*

---

## Feature 1: Barn Name — New Persistent Flock Field

Add a **Barn Name** field to the flock data model. This field is permanent and required — it cannot be removed or left blank once a flock is saved.

Barn Name should behave exactly like a Supplier selector:

- Show a dropdown of all existing barn names already in the system.
- Include an **"+ Add new barn name"** option inside the dropdown.
- When selected, show an inline input (or small modal) to type and save the new barn name.
- Once added, the new barn name is immediately selected and also available for future flocks.
- The list of barn names must be stored persistently (in the database or state store) so they survive page refreshes.

---

## Feature 2: Required Fields Enforcement — Flocks, Feeds & All Entry Forms

Every form that adds a new record (flock, feed, or any other entity) must enforce required fields before saving:

- Mark all mandatory fields with a **red asterisk (*)** next to the label.
- On submit, validate each required field. If any are empty:
  - Highlight the empty field(s) with a **red border**.
  - Show a clear **inline error message** below each missing field (e.g. *"Barn name is required"*).
  - **Scroll to the first error** automatically.
  - Do **NOT** close the form or save the record.
- Only save when all required fields are filled.

Barn Name is required for flocks. Apply the same pattern consistently to feeds and all other add forms.

---

## Feature 3: Flock List — Clean Traditional Table Layout

Redesign the flock list view as a clean, traditional data table:

- Use a standard table with **fixed column headers**.
- Each flock is **one row**. No cards, no tiles, no stacked layout.
- Columns must **not wrap text** — use `white-space: nowrap` and `text-overflow: ellipsis` where needed.
- Elements must **not overlap** — each cell has clear padding and defined width.
- Add a **horizontal scrollbar** to the table if content is too wide — do not shrink or stack columns.
- Include a visible column for **Barn Name**.
- Column headers should be **bold and clearly separated** from data rows (e.g. bottom border or light background).
- Use **zebra striping** (alternating row colors) for readability.
- **Sort by column header** on click — at minimum: flock name, barn name, date added.

---

## Feature 4: Superuser — Edit Existing Flock Information

Users with the **superuser** role must be able to edit all fields of an already-saved flock, including Barn Name.

- On the flock list table, superusers see an **Edit button** (pencil icon) on each row.
- Clicking Edit opens the same add-flock form **pre-populated** with the flock's current data.
- All fields (including Barn Name) are editable.
- The same **required-field validation** rules apply on save.
- **Regular users do NOT see the Edit button** — hidden based on role.
- After saving, the flock list **updates immediately** to reflect the changes.

---

## Implementation Notes

- Keep existing routing and component structure unless a change is clearly needed.
- The Barn Name selector should be a **reusable component** so it can be used in other forms later.
- All UI changes should match the **existing app's visual style and design system**.
- Test that:
  - [ ] A new barn name persists after page refresh
  - [ ] Required field errors appear correctly on empty submit
  - [ ] The table has no overlap or text-wrapping issues
  - [ ] Only superusers can see and access the Edit button
