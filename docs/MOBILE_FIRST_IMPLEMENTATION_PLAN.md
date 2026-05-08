# Mobile-First Implementation Plan

## 1. Goals
- Deliver a consistent mobile-first baseline for Talk and other app screens.
- Resolve viewport height bugs, keyboard overlap, swipe navigation issues, and safe-area padding.
- Align CSS/JS structure with existing modular Phase 3 pattern (dedicated bundles, no inline logic/styles).
- Keep desktop parity while optimizing for phones/tablets first.

---

## 2. Workstreams & Sequencing

### 2.1 CSS Foundations
**Invariant:** Base CSS must produce a fully usable mobile layout even if every `@media (min-width: …)` rule is stripped out.

1. **Viewport Fallback Layer**
   - Update `.app-container` in each page bundle (especially Talk) with the fallback → `dvh` ordering.
   - Add WebKit `@supports` block per sample for iOS fill-available.
   - Define safe-area vars in global scope (e.g., `_base-layout.css` or page bundle root) to avoid duplication.

2. **Safe-Area & Touch Adjustments**
   - Apply padding variables to `.header`, `.mobile-bottom-nav`, and any sticky toolbars.
   - Add `touch-action: manipulation` to all interactive controls listed (buttons, nav items, conversation cards, etc.).
   - Ensure scrollable panes keep `pan-y`/`pinch-zoom` for accessibility.

3. **Keyboard-Friendly Layout**
   - Extend `.message-input-area` and similar footers to use `var(--keyboard-height)` in their padding calculations.
   - Add transitions to avoid layout jumps when keyboard toggles.

4. **Mobile Default Visibility**
   - Update CSS so conversations list is visible first, while sidebar/chat panes are hidden until JS activates them.
   - Add `@media (min-width: 768px)` rules to re-enable split view.

5. **Accessibility Modes**
   - Integrate reduced-motion, high-contrast, and dark-mode adjustments described in the spec.
   - Verify tokens exist; fallback to `currentColor` when appropriate.

### 2.2 JavaScript Managers
**Navigation State Contract (Mobile)**
- Exactly one view is active at a time: `NAV_CONVERSATIONS_LIST` or `NAV_CHAT` (do not rely on raw `.active` toggles in code).
- Sidebar is not considered a state on mobile; it is merely a container that is shown/hidden.
- Keyboard and orientation classes are independent flags that must not alter the navigation state machine.
- Tablet/desktop (≥768px) intentionally fall back to the desktop navigation model; swipe state machine is disabled there by design.

**Legacy Listener Removal Rule**
- Remove existing resize listeners outside `OrientationManager`.
- Remove keyboard padding hacks that do not rely on `KeyboardManager`.
- Remove swipe handlers not owned by `SwipeManager`.

1. **OrientationManager**
   - Create `/assets/js/new/pages/talk/orientation-manager.js` (or shared util) implementing the provided class verbatim.
   - Hook into Talk page bootstrapping (`talk.js`) to instantiate once and expose on `window` for debugging.
   - Ensure any existing resize/orientation code is removed to prevent conflicts.

2. **SwipeManager**
   - Implement the corrected passive/non-passive listener setup.
   - Use `.sidebar`, `.chat-area`, `.conversations` references; confirm class names match DOM.
   - Provide guard rails so the manager only runs on touch devices (`'ontouchstart' in window`).

3. **KeyboardManager**
   - Add visualViewport-aware class with fallbacks.
   - Wire up `messageInput`/`messagesArea` IDs; rename DOM nodes if necessary for consistency.
   - Remove ad-hoc keyboard hacks elsewhere to keep single source of truth.

4. **Bootstrapping Script**
   - In `talk.js` (or shared initializer), instantiate the three managers during `DOMContentLoaded`.
   - Add `app-container.loaded` toggle after managers finish initial calculations to avoid FOUC.

### 2.3 HTML Template Adjustments
1. **Head Meta Tags**
   - Insert `viewport-fit=cover`, theme-color variants, Apple PWA tags, and `format-detection` meta in Talk and other mobile-heavy pages.
   - Ensure manifest + `pwa-init.js` remain included.

2. **Critical CSS Snippet**
   - Inline minimal CSS (mobile default states + FOUC prevention) in `<head>` before deferred bundle load.
   - Load main Talk CSS via `media="print" onload="this.media='all'"` or adopt existing bundler approach.

3. **Initial Markup Classes**
   - Add `id="appContainer"` and any classes required by new managers (e.g., `.mobile-default`).
   - Ensure `.mobile-bottom-nav` exists for navigation context, even if hidden on desktop.

### 2.4 QA & Verification
1. **Device Matrix**
   - iOS Safari (portrait/landscape, keyboard open) – confirm safe areas + keyboard padding.
   - Android Chrome (latest) – test dvh fallback and swipe navigation.
   - Desktop Chrome/Firefox – ensure layout remains stable and reduced-motion/high-contrast preferences apply.

2. **Manual Test Scenarios**
   - Swipe left/right between conversations/chat with and without selected conversation.
   - Open keyboard and type long messages; verify input stays visible.
   - Rotate device multiple times quickly to ensure debounce works (no layout thrash).
   - Validate `navigator.vibrate` calls do not throw on unsupported devices.

3. **Performance Checks**
   - Confirm passive listeners reduce scroll jank.
   - Monitor CLS when keyboard opens/closes.
   - Use Lighthouse mobile audit to ensure no regressions.
4. **State Integrity Test**
   - Open the keyboard, then rapidly rotate the device while swiping between views.
   - Ensure only one navigation view is visible at any moment and no ghost sidebars appear.

---

## 3. Deliverables
- Updated Talk CSS bundle plus shared tokens for safe areas/touch behavior.
- New JS modules: `OrientationManager`, `SwipeManager`, `KeyboardManager`, imported by Talk page controller.
- HTML head/meta/critical CSS adjustments in `talk.html` (and any cloned templates).
- QA notes summarizing device checks and any remaining edge cases.
- Living spec: `docs/mobile-navigation-state.md` documenting states, transitions, and DOM class contracts.

---

## 4. Risks & Mitigations
- **Class Name Drift:** Ensure CSS/JS selectors stay in sync; document required DOM hooks in Talk README.
- **Older Android Browsers:** Provide graceful fallbacks (existing matchMedia/resizing logic). Test on Chrome 80+.
- **Virtual Keyboard Variations:** Some Android OEMs report zero `visualViewport` delta; keep resize fallback logic in place.
- **Swipe Conflicts:** Verify horizontal swipe doesn’t interfere with carousel-like components; add per-component opt-out classes if needed.

---

## 5. Next Steps
1. Apply CSS fixes page-by-page, starting with Talk (highest traffic) then reusing mixins for other views.
2. Build and import the three managers; remove redundant legacy scripts.
3. Update HTML templates and verify bundler references.
4. Run QA matrix and log results in `docs/mobile-first-qa.md` (new file).
