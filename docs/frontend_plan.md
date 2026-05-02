# Frontend Improvement Plan: Enterprise SRE Experience

The current frontend has successfully achieved its goal as an MVP, proving that the end-to-end integration works. However, it currently leans into flashy animations and generic UI patterns ("AI vibecoded slop"). 

To win a hackathon with a developer tool, the UI needs to look and feel like an enterprise product (think Datadog, Vercel, Linear, or Sentry). It needs to prioritize **dense, scannable data**, **clear navigation**, and **actionable workflows**.

Here is the step-by-step plan to transform the frontend into a professional product.

---

## Phase 1: App Shell & Global Navigation
Currently, navigation relies on basic back buttons (`ArrowLeft`), and the layout shifts entirely between pages.
- **Implement a Persistent App Shell:** Create a unified `DashboardLayout` that wraps all authenticated pages. It should feature a clean top navbar or a sleek left sidebar.
- **Breadcrumbs:** Implement routing breadcrumbs (e.g., `Recovera / Priyanshu-Ku/payment-api / Incidents`) so users always know their context within a specific repository.
- **Global Typography:** Standardize on a professional font like `Geist`, `Inter`, or system sans-serif. Use monospace fonts (`JetBrains Mono` or `Fira Code`) strictly for technical data like commit SHAs, file paths, and log outputs.

## Phase 2: Meaningful Data Visualization
Currently, metrics and graphs are hardcoded CSS blocks or arbitrary numbers.
- **Implement `recharts` or `tremor`:** Replace the hardcoded CSS heatmap with real, interactive time-series charts that map exact incident frequency over time.
- **Meaningful Empty States:** If a repository has no incidents, don't just show "No incidents found." Show an elegant empty state with actionable instructions (e.g., a code snippet on how to curl the `/api/ingest/logs` endpoint to trigger an alert).
- **Status Badges:** Standardize visual language for statuses.
  - `Resolved` / `Success`: Subdued Emerald (not overly bright).
  - `Pending Approval`: Amber.
  - `Investigating` / `Failed`: Rose/Red.

## Phase 3: Incident Management UX (The Core Loop)
Currently, `RepoDashboard.tsx` stacks incidents in massive vertical cards, which doesn't scale well for an SRE looking at multiple alerts.
- **Data Table Layout:** Convert the "Issues" tab into a dense, scannable Data Table. Columns should include: `Status`, `Confidence`, `Title`, `Time`, and `Assignee`.
- **Incident Side-Sheet (Drawer):** Instead of cramming "Generate Fix" and "Open PR" buttons directly into the list, clicking an incident row should open a side-sheet (drawer). 
- **The Remediation Timeline:** Inside the side-sheet, display a clean vertical timeline:
  1. **Detection:** Show the raw error log snippet.
  2. **Analysis:** Show the AI's root cause analysis.
  3. **Fix:** Display the generated patch using a proper **Syntax Highlighted Diff Viewer** (red for removed, green for added) so the user can actually review the code before clicking "Open PR".
  4. **Safety Gate:** If it requires human approval, show the exact policy rule that triggered the block.

## Phase 4: Feedback & Micro-Interactions
Currently, the app relies on basic spinners and browser `alert()` popups.
- **Toast Notifications:** Integrate a library like `sonner` or `react-hot-toast`. When a user clicks "Generate Fix", they should see a non-blocking toast ("🤖 AutoSRE analyzing codebase...") rather than locking up the UI.
- **Skeleton Loaders:** Replace the generic `Loader2` spinners with skeleton UI blocks that mimic the shape of the data table or charts while data is fetching.
- **Button States:** Ensure all buttons have explicit `idle`, `loading`, `success`, and `disabled` states.

## Phase 5: Landing Page Refinement
The landing page should communicate technical competence, not just AI magic.
- **Terminal/IDE Aesthetics:** Ground the hero section in developer reality. Instead of abstract glowing orbs, show a beautiful, animated "Before/After" code diff component.
- **Snappier Animations:** Reduce animation duration and delays. Enterprise tools feel incredibly fast; slow fade-ins can make a web app feel sluggish.

---

### Suggested Execution Order
1. **Quick Wins:** Install `sonner` (toasts) and fix the Data Table layout in `RepoDashboard.tsx`.
2. **High Impact:** Build the Incident Side-Sheet and the Diff Viewer (this is the "Wow Factor" for judges).
3. **Refinement:** Add `recharts` for the dashboard and build the App Shell.
