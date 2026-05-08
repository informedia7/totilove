# Talk Mobile-First QA Plan

## 1. Scope & Objectives
- Validate that the Talk experience behaves predictably across common phone/tablet breakpoints after the mobile-first workstreams (CSS viewport fixes, nav-state bridge, Orientation/Keyboard/Swipe managers).
- Ensure no regressions on desktop browsers where the legacy split-view remains active.
- Capture reproducible steps and owners for any defects so the remaining Safe-Area + CSS polish can proceed with confidence.

## 2. Test Environment
- **Build**: Latest `talk.html` / `talk copy.html` with `_talk.css` bundle + managers.
- **Data**: Use seeded conversations with text + attachments so search panel, message list, and block/report flows have content.
- **Feature Flags**: Ensure Talk nav helpers (`showChatViewOnMobile`, `showConversationListOnMobile`) and managers are enabled (default in current build).
- **Accounts**: One primary account (`currentUser`) plus at least two partners to drive conversation switching.

## 3. Device / Browser Matrix
| Device Class | Hardware Example | Browser | OS Version | Primary Focus |
| --- | --- | --- | --- | --- |
| Small Phone | iPhone 13 mini | Safari | iOS 17 | Safe areas, keyboard push, back button visibility |
| Standard Phone | iPhone 15 / Pixel 8 | Safari / Chrome | iOS 17 / Android 14 | Swipe nav, nav-state sync, search overlay |
| Large Phone / Small Tablet | Galaxy S24+ | Chrome | Android 14 | Orientation thrash, dvh fallback, haptics |
| Tablet Portrait | iPad mini | Safari | iPadOS 17 | CSS fallback when crossing 768px breakpoint |
| Desktop | MacBook / Windows | Chrome + Firefox (latest) | macOS 15 / Windows 11 | Regressions in split view, reduced-motion handling |

## 4. Manual Test Scenarios
1. **Initial Load**
   - Observe `.app-container` opacity transition: hidden until `loaded` class appears.
   - Confirm body `data-nav-state` starts as `NAV_CONVERSATIONS_LIST`; sidebar visible, chat hidden on <768px.

2. **Conversation Selection / Nav Toggles**
   - Tap a conversation: helpers should switch to `NAV_CHAT`, sidebar hidden, chat visible.
   - Use in-chat back button: expect `NAV_CONVERSATIONS_LIST` restored and scroll position preserved.

3. **Swipe Manager**
   - On touch devices, swipe right from chat to expose list, swipe left from list (with selected conversation) to open chat.
   - Verify swipe is ignored when no conversation is selected, and when viewport >=768px.

4. **Keyboard Manager**
   - Focus message input; confirm message area lifts using `--keyboard-height` padding, no overlap.
   - Rotate device with keyboard open; layout should remain stable (debounce works, no double padding).

5. **Orientation Manager**
   - Rotate between portrait/landscape rapidly; ensure `orientation-portrait` / `orientation-landscape` classes toggle once per change and nav state does not reset unexpectedly.

6. **Search / Panels**
   - Open search panel and date filters; confirm safe-area padding, no viewport jump.

7. **Safe-Area / Bottom Nav**
   - Inspect `.mobile-bottom-nav` spacing on iOS (both orientations) to ensure `env(safe-area-inset-*)` values align.

8. **Accessibility Preferences**
   - Enable `prefers-reduced-motion` at OS level; confirm opacity transition is disabled (critical CSS includes fallback).
   - Switch to high-contrast mode (Windows) to ensure text/buttons remain legible.

9. **Error Handling**
   - Simulate network drop (toggle offline); verify placeholders remain accessible and nav state persists.

## 5. Performance & Telemetry Checks
- Record CLS while opening keyboard; target <0.05.
- Use Chrome DevTools Performance to confirm passive listeners (`SwipeManager`) avoid scroll jank.
- Run Lighthouse mobile audit; compare against baseline to spot regressions in First Contentful Paint and TTI.

## 6. Regression Targets
- Desktop split view: ensure conversations and chat display side-by-side with no forced overlays.
- Legacy modals (user profile, block confirmation) still open and trap focus after nav-state changes.
- No console errors from managers when DOM nodes are missing (watch log during navigation).

## 7. Reporting Template
For each defect, capture:
1. **Env/Build**: Git SHA / timestamp, device, browser.
2. **State**: Current `data-nav-state`, orientation class, keyboard visibility.
3. **Steps**: Numbered list, include swipe direction + duration if relevant.
4. **Expected vs Actual**: Reference spec terminology (e.g., "sidebar should remain hidden on NAV_CHAT").
5. **Artifacts**: Screenshots or screen recording (max 10s) plus console/network logs if available.

## 8. Exit Criteria
- All scenarios above pass on each device in the matrix.
- No blocker or critical defects remain open.
- At most low-severity visual deltas allowed, documented for follow-up in Safe-Area polishing ticket.
