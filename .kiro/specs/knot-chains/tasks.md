# Implementation Plan: Knot Chains (Cadenas de Nudos)

## Overview

This plan implements the Knot Chains feature incrementally: starting with data models and service logic, then extending existing components, adding the new Chain View, and finally wiring integration points (export/import, lifecycle hooks). Each task builds on previous steps to ensure no orphaned code.

## Tasks

- [x] 1. Define data models and extend Knot interface
  - [x] 1.1 Create the Chain model interface
    - Create `src/app/models/chain.model.ts` with the `Chain` interface (`id: string`, `name: string`, `createdAt: number`)
    - _Requirements: 1.5_

  - [x] 1.2 Extend the Knot model with chain fields
    - Add optional `chainId?: string | null` and `chainOrder?: number | null` to the existing `Knot` interface
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.3 Add new event types for chain operations
    - Extend the `EventType` type/enum with: `CHAIN_CREATED`, `CHAIN_DELETED`, `KNOT_ADDED_TO_CHAIN`, `KNOT_REMOVED_FROM_CHAIN`, `CHAIN_REORDERED`
    - _Requirements: 9.1_

- [x] 2. Implement ChainService with core logic
  - [x] 2.1 Create ChainService scaffold with storage integration
    - Create `src/app/services/chain.service.ts` as an `@Injectable({ providedIn: 'root' })` standalone service
    - Initialize `BehaviorSubject<Chain[]>` from LocalStorage key `nudos_v1_chains`
    - Implement `getChains()`, `getChainById(id)`, `getChainKnots(chainId)` (sorted by chainOrder asc), `getChainSize(chainId)`
    - _Requirements: 1.6, 1.7_

  - [x] 2.2 Implement chain creation logic
    - Implement `createChain(name: string): Chain` — validates name (1–50 chars, non-whitespace-only), generates UUID, creates Chain record, persists to LocalStorage, logs `CHAIN_CREATED` event
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [x] 2.3 Implement addKnotToChain and removeKnotFromChain
    - `addKnotToChain(knotId, chainId)`: assigns knot to last position (current size), enforces max 50 capacity, persists, logs `KNOT_ADDED_TO_CHAIN`
    - `removeKnotFromChain(knotId)`: sets chainId/chainOrder to null, recalculates consecutive chainOrder for remaining knots, deletes chain if empty, logs `KNOT_REMOVED_FROM_CHAIN`
    - _Requirements: 3.2, 3.4, 3.7, 8.3, 8.4, 8.5, 8.6_

  - [x] 2.4 Implement moveKnotToChain
    - `moveKnotToChain(knotId, newChainId)`: removes from current chain (recalculates order, deletes if empty), appends to new chain at last position
    - _Requirements: 3.6_

  - [x] 2.5 Implement reorderKnot
    - `reorderKnot(chainId, fromIndex, toIndex)`: moves knot within chain, recalculates all chainOrder values as consecutive 0-based integers, persists, logs `CHAIN_REORDERED`
    - _Requirements: 4.2, 4.4_

  - [x] 2.6 Implement deleteChain and validateIntegrity
    - `deleteChain(chainId)`: removes chain record, clears chainId/chainOrder on all member knots, logs `CHAIN_DELETED`
    - `validateIntegrity()`: clears orphan chainIds (referencing non-existent chains), deletes empty chains, recalculates consecutive chainOrder — runs on init and after import
    - _Requirements: 9.4, 9.5, 9.6_

  - [x]* 2.7 Write property tests for ChainService (Properties 1–6, 14–15)
    - **Property 1: chainId/chainOrder Co-Nullity Invariant** — after random operations, every knot has both null or both non-null
    - **Property 2: Consecutive chainOrder Within a Chain** — after random add/remove/reorder/move, chainOrder forms {0..N-1}
    - **Property 3: Referential Integrity** — no orphan chainIds, no empty chains after persist
    - **Property 4: Append to End** — new knot gets chainOrder = current size, existing knots unchanged
    - **Property 5: Chain Name Validation** — whitespace-only rejected, valid 1–50 accepted
    - **Property 6: Chain Creation Assigns First Position** — new chain knot gets chainOrder = 0
    - **Property 14: Reorder Correctness** — moved item lands at target, result is {0..N-1}
    - **Property 15: Move Between Chains** — source recalculates, target appends, empty source deleted
    - **Validates: Requirements 1.4, 1.7, 2.2, 2.4, 3.2, 3.4, 3.6, 4.2, 4.4, 8.4, 8.5, 9.4, 9.5, 9.6**

- [x] 3. Checkpoint - Core service logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend StoreService for chain persistence and lifecycle hooks
  - [x] 4.1 Add chain storage CRUD to StoreService
    - Add methods to load/save chains from/to `nudos_v1_chains` LocalStorage key
    - Ensure `deleteKnot` removes knot from chain (recalculates chainOrder, deletes empty chain)
    - Ensure knot archiving (`ARCHIVED` transition) removes knot from chain similarly
    - _Requirements: 1.6, 9.4, 9.5_

  - [x] 4.2 Extend export/import to include chains
    - Add `chains` array to export JSON schema
    - On import: if `chains` present, restore and run `validateIntegrity()`; if absent, treat as empty chains and clear any orphan chainIds on knots
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

  - [x]* 4.3 Write property tests for export/import (Properties 12–13)
    - **Property 12: Knot Removal Preserves Non-Chain Fields** — after removeKnotFromChain, all non-chain fields unchanged
    - **Property 13: Export Completeness** — exported chains array matches storage exactly
    - **Validates: Requirements 8.6, 9.1**

- [x] 5. Extend CaptureModalComponent for chain association
  - [x] 5.1 Add chain selection UI to CaptureModal
    - Add radio group after existing fields: "Sin cadena" (default) | "Crear nueva cadena" | "Agregar a cadena existente"
    - When "Crear nueva cadena" selected: show text input for chain name (1–50 chars, non-whitespace validation with inline error)
    - When "Agregar a cadena existente" selected: show list of chains sorted by createdAt desc, with knot count per chain
    - Show capacity message if selected chain has 50 knots; show empty-state message if no chains exist
    - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.3, 3.5, 3.7_

  - [x] 5.2 Wire CaptureModal submission to ChainService
    - On confirm: if "Crear nueva cadena" → call `ChainService.createChain(name)` then `addKnotToChain(newKnotId, chainId)`
    - If "Agregar a cadena existente" → call `ChainService.addKnotToChain(newKnotId, selectedChainId)`
    - If "Sin cadena" → no chain logic (existing flow unchanged)
    - _Requirements: 2.2, 3.2, 3.4_

  - [x]* 5.3 Write unit tests for CaptureModal chain flow
    - Test default "Sin cadena" state, new chain creation validation, existing chain selection, capacity limit message, empty state message
    - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.5, 3.7_

- [x] 6. Extend KnotDetailModalComponent for chain management
  - [x] 6.1 Add chain actions to KnotDetailModal
    - Show "Quitar de cadena" button when knot has chainId — with confirmation alert before removal
    - Show chain name and position info (e.g., "Paso 3 de 7 en: Mi Cadena")
    - Add option to assign/move knot to a different chain (calls `moveKnotToChain` or `addKnotToChain`)
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7, 3.4, 3.6_

  - [x]* 6.2 Write unit tests for KnotDetailModal chain actions
    - Test remove button visibility, confirmation dialog, chain info display, move-to-chain flow
    - _Requirements: 8.1, 8.2, 8.7_

- [x] 7. Checkpoint - Chain creation and management flows
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Extend KnotCardComponent with Chain Indicator
  - [x] 8.1 Add Chain_Indicator badge to knot card
    - When knot has chainId: display badge in top badge row after score badge showing `N/T` (1-based position / total)
    - Use distinct `kbd` CSS class with unique background color
    - Display chain name after badge, truncated to 20 chars with ellipsis if longer
    - If chain record not found in storage, hide indicator silently
    - When knot has no chainId, display no chain indicators
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 8.2 Write property tests for badge display (Properties 10–11)
    - **Property 10: Chain Indicator Badge Format** — badge shows `(P+1)/(T)` for knot at chainOrder P in chain of size T
    - **Property 11: Chain Name Truncation** — names > 20 chars truncated with "…", others shown in full
    - **Validates: Requirements 7.1, 7.2**

- [x] 9. Implement ChainViewComponent (sequence view)
  - [x] 9.1 Create ChainViewComponent with vertical timeline rendering
    - Create `src/app/components/chain-view/chain-view.component.ts` as standalone component
    - Render each chain as vertical timeline: circular nodes connected by vertical lines, ordered by chainOrder ascending
    - Show chain name as header above each timeline
    - Display knot title and status label per node
    - Chains ordered by createdAt descending (newest first)
    - Single-knot chains: render single node without connecting line
    - _Requirements: 6.1, 6.5, 6.6, 6.8, 6.9_

  - [x] 9.2 Implement active/done/pending node styling
    - Active node (first non-DONE by chainOrder): primary accent color on circle and border
    - Done nodes: green checkmark inside circle
    - Pending nodes (non-DONE after active): gray circle and gray text
    - All-DONE chain: all green checkmarks, green connecting line, no active highlight
    - _Requirements: 6.2, 6.3, 6.4, 6.7_

  - [x] 9.3 Implement drag-and-drop reorder in ChainView
    - Use Angular CDK DragDrop for reorder via drag handles (touch long-press + mouse click-and-drag)
    - On drop: call `ChainService.reorderKnot()`, update visual within 300ms
    - On persist failure: revert visual positions, show error toast
    - Hide drag handle for chains with fewer than 2 knots
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 9.4 Implement quick action buttons in ChainView
    - UNLOCKABLE knots: show "Start" button → calls `RulesService.transitionToDoing`; on error show alert
    - DOING knots: show "Done" button → calls `RulesService.transitionToDone(feltLighter: true)`, update timeline within 1s highlighting next active node; show "Timer" button → calls `TimerService.start` and opens FocusTimerModalComponent
    - On tap knot node: open KnotDetailModal, refresh ChainView on dismiss
    - If no non-DONE knot after marking done: display completed state, no active highlight
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x]* 9.5 Write property tests for active node identification and chain display order (Properties 8–9)
    - **Property 8: Active Node Identification** — active node is lowest chainOrder with status ≠ DONE; if all DONE, no active
    - **Property 9: Chain Display Order** — chains sorted by createdAt descending
    - **Validates: Requirements 6.2, 6.8, 10.5, 10.6**

  - [x]* 9.6 Write unit tests for ChainViewComponent
    - Test timeline rendering, node styling, drag-reorder, quick actions, single-knot chain, empty state
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.9, 4.3, 4.5_

- [x] 10. Implement View Toggle on TodayPage
  - [x] 10.1 Add view toggle to TodayPage header
    - Add toggle control with "Vista lista" and "Vista secuencia" options, indicating current selection
    - Persist preference in LocalStorage key `nudos_ui_view_mode` (`'list' | 'chain'`)
    - Default to `'list'` if no preference stored
    - Conditionally render existing knot list or ChainViewComponent based on mode
    - In Chain_View: show unchained knots in a "Sin cadena" section below chain timelines
    - Show empty state in Chain_View when no chains exist (with guidance on creating chains)
    - Switch views within 300ms without losing unsaved knot state
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 10.2 Write property test for view mode persistence (Property 7)
    - **Property 7: View Mode Persistence Round-Trip** — persist and read back yields same value; default is 'list'
    - **Validates: Requirements 5.4, 5.5**

  - [x]* 10.3 Write unit tests for view toggle
    - Test toggle rendering, mode switching, persistence, default behavior, empty state
    - _Requirements: 5.1, 5.4, 5.5, 5.6_

- [x] 11. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- All chain operations use 0-based chainOrder internally, displayed as 1-based in UI
- Angular CDK DragDrop is used for reorder (no new dependencies needed beyond `@angular/cdk`)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6"] },
    { "id": 4, "tasks": ["2.7", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["5.1", "6.1", "8.1"] },
    { "id": 7, "tasks": ["5.2", "5.3", "6.2", "8.2"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["9.2", "9.3"] },
    { "id": 10, "tasks": ["9.4", "9.5", "9.6"] },
    { "id": 11, "tasks": ["10.1"] },
    { "id": 12, "tasks": ["10.2", "10.3"] }
  ]
}
```
