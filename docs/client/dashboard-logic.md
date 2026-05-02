# Dashboard.tsx — State & Logic Explained Line by Line

This document explains the state management, data fetching, filtering, and import logic in `Dashboard.tsx`.

---

## The Full Code Block

```tsx
const [query, setQuery] = useState("");
const [importing, setImporting] = useState<number | null>(null);
const [imported, setImported] = useState<number | null>(null);

useEffect(() => {
  fetch("/api/github/repos")
    .then(r => r.json())
    .then(data => {
      if (data.error) { setError(data.error); }
      else { setRepos(data); }
    })
    .catch(() => setError("Could not connect to GitHub. Please try again."))
    .finally(() => setLoading(false));
}, []);

const filtered = repos.filter(r =>
  r.name.toLowerCase().includes(query.toLowerCase()) ||
  (r.description && r.description.toLowerCase().includes(query.toLowerCase()))
);

const handleImport = (id: number) => {
  setImporting(id);
  setTimeout(() => {
    setImporting(null);
    setImported(id);
  }, 2000);
};
```

---

## State Variables

### Line 1 — `query` state
```tsx
const [query, setQuery] = useState("");
```
- `query` holds the **current text the user has typed** into the search box.
- It starts as an empty string `""` — meaning no filter is applied when the page first loads.
- Every time the user types, `setQuery` is called, which updates `query` and re-renders the list with filtered results.

---

### Line 2 — `importing` state
```tsx
const [importing, setImporting] = useState<number | null>(null);
```
- `importing` tracks **which repo is currently being imported** (by its numeric ID).
- The type `number | null` means it can either be a repo's ID (e.g., `42`) or `null` (meaning no import is in progress).
- When `null`, no spinner is shown. When set to a number, the matching repo row shows a spinning "Importing…" button.

---

### Line 3 — `imported` state
```tsx
const [imported, setImported] = useState<number | null>(null);
```
- `imported` remembers **which repo was successfully imported**.
- Also `number | null`. `null` = nothing imported yet. A number = that repo ID was imported.
- This is also used to **disable all other Import buttons** once one repo has been imported — preventing the user from importing multiple repos at once.

---

## Data Fetching — `useEffect`

```tsx
useEffect(() => {
  fetch("/api/github/repos")
    ...
}, []);
```
- `useEffect` runs **once after the component first mounts** onto the screen (the empty `[]` dependency array ensures it only runs once, not on every re-render).
- Think of it as "do this side-effect when the page loads."

---

### Line-by-line inside `useEffect`

```tsx
fetch("/api/github/repos")
```
- Makes an HTTP `GET` request to our internal Next.js API route.
- That route uses the user's GitHub `access_token` (stored in the session) to call `api.github.com` and return the user's repos.
- This is a Promise — it doesn't block the UI. React keeps rendering while waiting for the response.

---

```tsx
.then(r => r.json())
```
- When the response arrives, `.then()` is called with the raw Response object `r`.
- `.json()` parses the response body from raw text into a JavaScript object/array.
- This also returns a Promise, so we chain another `.then()`.

---

```tsx
.then(data => {
  if (data.error) { setError(data.error); }
  else { setRepos(data); }
})
```
- `data` is the parsed JSON — either an **array of repos** or an **error object** (`{ error: "..." }`).
- If the API returned an error (e.g., no access token), we store the error message in state with `setError`.
- If the data is valid, we populate the repo list with `setRepos(data)`, triggering a re-render to show the repos.

---

```tsx
.catch(() => setError("Could not connect to GitHub. Please try again."))
```
- `.catch()` handles **network-level failures** — for example, if the user is offline, or the server threw an uncaught exception.
- It sets a user-friendly error message that will be displayed in the UI.

---

```tsx
.finally(() => setLoading(false));
```
- `.finally()` runs **regardless of whether the fetch succeeded or failed**.
- It turns off the loading spinner by setting `loading` to `false`.
- Without this, if an error occurred, the spinner would spin forever.

---

## Search Filtering

```tsx
const filtered = repos.filter(r =>
  r.name.toLowerCase().includes(query.toLowerCase()) ||
  (r.description && r.description.toLowerCase().includes(query.toLowerCase()))
);
```
- This **derives** a filtered array from `repos` every time the component re-renders (which happens whenever `query` changes).
- It doesn't mutate the original `repos` array — it creates a new one.

**Line by line:**

```tsx
r.name.toLowerCase().includes(query.toLowerCase())
```
- Converts both the repo name and the search query to lowercase before comparing, making the search **case-insensitive**.
- `includes()` returns `true` if the query appears anywhere inside the repo name.

```tsx
|| (r.description && r.description.toLowerCase().includes(query.toLowerCase()))
```
- The `||` means "OR" — so a repo is shown if its **name** OR its **description** matches the query.
- `r.description &&` is a safety check — some repos have no description (`null`). Without this guard, calling `.toLowerCase()` on `null` would crash.

---

## Import Handler

```tsx
const handleImport = (id: number) => {
  setImporting(id);
  setTimeout(() => {
    setImporting(null);
    setImported(id);
  }, 2000);
};
```
- `handleImport` is called when the user clicks the **"Import"** button on a repo row.
- `id` is the numeric GitHub repository ID for the repo being imported.

**Line by line:**

```tsx
setImporting(id);
```
- Immediately sets `importing` to this repo's ID.
- This causes the matching row to switch its button text to `"Importing…"` with a spinning icon.
- All other rows' Import buttons become greyed out and disabled (because `imported !== null` check in the button).

```tsx
setTimeout(() => { ... }, 2000);
```
- Waits **2 seconds** to simulate the import process completing.
- In production, this would be replaced with a real `await fetch(...)` call to your backend to register the repo.

```tsx
setImporting(null);
```
- After the 2 seconds, clears the "importing" state — the spinning animation stops.

```tsx
setImported(id);
```
- Sets `imported` to the repo's ID, marking it as successfully imported.
- The button turns green and shows a ✅ "Imported" label.
- The green success banner animates in at the bottom of the page.

---

## Summary Table

| Variable/Function | Type | Purpose |
|---|---|---|
| `query` | `string` | Tracks the live search input |
| `importing` | `number \| null` | ID of repo currently showing "Importing..." spinner |
| `imported` | `number \| null` | ID of repo that was successfully imported |
| `useEffect` + `fetch` | Side-effect | Fetches real GitHub repos once on mount |
| `filtered` | `Repo[]` | Derived list of repos matching the search query |
| `handleImport(id)` | Function | Simulates the import flow with loading → success states |
