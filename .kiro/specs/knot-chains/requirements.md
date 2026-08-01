# Requirements Document

## Introduction

Cadenas de Nudos (Knot Chains) es una funcionalidad para la app Nudos que permite agrupar nudos individuales en secuencias lineales ordenadas. Proporciona una vista alternativa tipo stepper/timeline vertical, manteniendo la vista de lista actual como opción por defecto. Las cadenas son opcionales — los nudos sin cadena siguen funcionando exactamente igual que antes.

## Glossary

- **Knot (Nudo)**: Unidad atómica de trabajo en la app Nudos. Tiene un estado de ciclo de vida (DOING, UNLOCKABLE, SOMEDAY, BLOCKED, DONE, ARCHIVED).
- **Chain (Cadena)**: Agrupación lineal y ordenada de nudos que representa una secuencia de pasos a completar uno tras otro.
- **Chain_View (Vista_Secuencia)**: Modo alternativo de visualización que muestra los nudos agrupados por cadena en un timeline vertical con nodos conectados.
- **List_View (Vista_Lista)**: Vista por defecto existente que muestra los nudos individuales organizados por estado.
- **Chain_Indicator (Indicador_Cadena)**: Elemento visual compacto en las tarjetas de la vista lista que muestra la posición del nudo dentro de su cadena (ej: `2/5`).
- **Active_Node (Nodo_Activo)**: El nudo con el estado más avanzado en progreso dentro de una cadena (DOING o el primer UNLOCKABLE/SOMEDAY/BLOCKED pendiente).
- **StoreService**: Servicio de persistencia de la app basado en LocalStorage.
- **Capture_Modal (Modal_Captura)**: Componente modal usado para crear nuevos nudos.
- **Chain_Order (Orden_Cadena)**: Posición numérica de un nudo dentro de su cadena (empezando desde 1).

## Requirements

### Requirement 1: Chain Data Model

**User Story:** As a user, I want nudos to optionally belong to a chain, so that I can organize related tasks into sequential steps.

#### Acceptance Criteria

1. THE Knot model SHALL include an optional `chainId` field of type string (UUID format) that references the chain to which the knot belongs.
2. THE Knot model SHALL include an optional `chainOrder` field of type non-negative integer (0-based) that represents the position of the knot within its chain.
3. WHEN a knot does not belong to any chain, THE StoreService SHALL store `chainId` as null and `chainOrder` as null.
4. IF a knot has a non-null `chainId`, THEN THE Knot model SHALL also have a non-null `chainOrder` value, and vice versa.
5. THE Chain model SHALL consist of an `id` field of type string (UUID format), a `name` field of type string with a maximum length of 100 characters and a minimum length of 1 character, and a `createdAt` field of type number (Unix timestamp in milliseconds).
6. THE StoreService SHALL persist chains in LocalStorage under the key `nudos_v1_chains`, separate from knots.
7. WHEN multiple knots belong to the same chain, THE StoreService SHALL ensure each knot has a unique `chainOrder` value within that chain.

### Requirement 2: Chain Creation

**User Story:** As a user, I want to create new chains, so that I can start grouping related nudos into sequences.

#### Acceptance Criteria

1. WHEN the user selects "Crear nueva cadena" during knot capture, THE Capture_Modal SHALL display a text input for the chain name that accepts between 1 and 50 characters.
2. WHEN the user provides a chain name and confirms capture, THE StoreService SHALL create a new Chain record and assign the captured knot as position 1 in the chain.
3. WHEN the user creates a chain, THE StoreService SHALL generate a unique identifier for the chain using the same UUID generation method used for knots.
4. IF the user leaves the chain name empty or whitespace-only and attempts to create a chain, THEN THE Capture_Modal SHALL display a validation message requesting a name and SHALL prevent submission until a valid name is provided.
5. THE Capture_Modal SHALL default to no chain association, allowing the user to capture a knot without selecting or creating a chain.
6. THE StoreService SHALL allow multiple chains to have the same name.

### Requirement 3: Adding Knots to Existing Chains

**User Story:** As a user, I want to add new nudos to existing chains, so that I can extend my sequences organically.

#### Acceptance Criteria

1. WHEN the user selects "Agregar a cadena existente" during knot capture, THE Capture_Modal SHALL display a list of all existing chains (including chains where all knots are DONE) with their names, sorted by most recently created first.
2. WHEN the user selects an existing chain and confirms capture, THE StoreService SHALL assign the new knot to the last position in the selected chain (max existing chainOrder + 1), up to a maximum of 50 knots per chain.
3. WHILE the chain selection list is displayed, THE Capture_Modal SHALL display the current number of nudos in each listed chain next to the chain name.
4. WHEN the user adds a knot to an existing chain from the knot detail view, THE StoreService SHALL assign the knot to the last position in the selected chain (max existing chainOrder + 1).
5. IF the user selects "Agregar a cadena existente" and no chains exist, THEN THE Capture_Modal SHALL display a message indicating that no chains are available and offering to create a new chain instead.
6. IF the user adds a knot that already belongs to a chain to a different chain from the knot detail view, THEN THE StoreService SHALL remove the knot from its current chain, recalculate chainOrder for the remaining knots in the original chain, and assign the knot to the last position of the newly selected chain.
7. IF the selected chain already contains 50 knots, THEN THE Capture_Modal SHALL display a message indicating the chain has reached its maximum capacity and prevent the addition.

### Requirement 4: Chain Reordering

**User Story:** As a user, I want to reorder nudos within a chain by dragging, so that I can adjust the sequence as my plan evolves.

#### Acceptance Criteria

1. WHILE the Chain_View is active, THE Chain_View SHALL allow the user to reorder knots within a chain via a drag handle that supports both touch (long-press and drag) and mouse (click-and-drag) input methods.
2. WHEN the user drops a knot at a new position within the same chain, THE StoreService SHALL update the `chainOrder` of all affected knots to reflect the new sequence without gaps.
3. WHEN the user completes a reorder operation, THE Chain_View SHALL update the visual position of the moved knot within 300 milliseconds of the drop event without requiring a page refresh.
4. THE StoreService SHALL maintain consecutive chainOrder values (1, 2, 3...) for all knots in a chain after any reordering operation.
5. IF the StoreService fails to persist the updated chainOrder values after a reorder operation, THEN THE Chain_View SHALL revert the visual positions to the previous order and display an error message indicating the reorder could not be saved.
6. WHILE the Chain_View is active AND a chain contains fewer than 2 knots, THE Chain_View SHALL NOT display the drag handle for that chain's knots.

### Requirement 5: View Toggle

**User Story:** As a user, I want to toggle between list view and sequence view, so that I can choose the most useful representation at any moment.

#### Acceptance Criteria

1. THE application SHALL display a toggle control in the Today page header with two options: "Vista lista" and "Vista secuencia", visually indicating the currently active option.
2. WHEN the user selects "Vista secuencia", THE application SHALL display knots grouped by chain in a vertical timeline layout, and display any knots not belonging to a chain in a separate "Sin cadena" section below the chain timelines.
3. WHEN the user selects "Vista lista", THE application SHALL display knots in the existing list layout organized by status sections.
4. WHEN the user selects a view mode, THE application SHALL persist the selected view mode in LocalStorage so that it is restored on the next app launch.
5. IF no view preference has been saved in LocalStorage, THEN THE application SHALL default to "Vista lista" as the active view.
6. WHEN the user is in Chain_View and has no chains, THE Chain_View SHALL display an empty state message that includes a description of how to create a chain from the capture flow.
7. WHEN the user toggles between views, THE application SHALL switch the displayed view within 300 milliseconds without losing any unsaved knot state.

### Requirement 6: Sequence View Rendering

**User Story:** As a user, I want to see my chains as a vertical stepper/timeline, so that I can visualize my progress through a sequence of steps.

#### Acceptance Criteria

1. WHILE Chain_View is active, THE Chain_View SHALL render each chain as a vertical timeline where circular nodes are connected by a vertical line, with nodes ordered top-to-bottom by ascending chainOrder.
2. WHILE Chain_View is active, THE Chain_View SHALL highlight the active node (the first knot in chainOrder whose status is not DONE) with the primary accent color applied to the node circle and border.
3. WHILE Chain_View is active, THE Chain_View SHALL display completed nodes (status DONE) with a green checkmark indicator inside the node circle.
4. WHILE Chain_View is active, THE Chain_View SHALL display pending nodes (non-DONE knots after the active node in chainOrder) with a gray node circle and gray text.
5. WHILE Chain_View is active, THE Chain_View SHALL display the chain name as a header above each chain timeline.
6. WHILE Chain_View is active, THE Chain_View SHALL display the knot title and status label for each node in the timeline.
7. WHILE Chain_View is active AND a chain has all knots in DONE status, THE Chain_View SHALL display all nodes with green checkmark indicators and the connecting line in green.
8. WHILE Chain_View is active AND multiple chains exist, THE Chain_View SHALL display chains ordered by creation date (newest first).
9. IF a chain contains only one knot, THEN THE Chain_View SHALL render the chain as a single node without a connecting line, following the same active/done/pending styling rules.

### Requirement 7: Chain Indicator on List View Cards

**User Story:** As a user, I want to see a small chain indicator on knot cards in list view, so that I know a knot is part of a bigger sequence without leaving my current view.

#### Acceptance Criteria

1. WHEN a knot belongs to a chain AND the List_View is active, THE knot card SHALL display a Chain_Indicator badge in the top badge row (after the score badge) showing the knot's position and total chain length in the format `N/T` where N is the knot's chainOrder and T is the total number of nudos in that chain.
2. WHEN a knot belongs to a chain AND the List_View is active, THE knot card SHALL display the chain name immediately after the Chain_Indicator badge, truncated with an ellipsis if it exceeds 20 characters.
3. WHEN a knot does not belong to any chain, THE knot card SHALL NOT display any chain-related indicators.
4. THE Chain_Indicator badge SHALL use the `kbd` CSS class pattern with a distinct background color (different from the gray used by other `kbd` badges) to visually differentiate chain information from other badge types.
5. IF the chain associated with a knot no longer exists in storage, THEN THE knot card SHALL NOT display any chain-related indicators for that knot.

### Requirement 8: Removing Knots from Chains

**User Story:** As a user, I want to remove a nudo from a chain, so that I can adjust my sequences when plans change.

#### Acceptance Criteria

1. WHILE a knot belongs to a chain, THE KnotDetailModalComponent SHALL display a "remove from chain" action button.
2. WHEN the user taps the "remove from chain" button, THE KnotDetailModalComponent SHALL display a confirmation alert before proceeding with the removal.
3. WHEN the user confirms removal of a knot from a chain, THE StoreService SHALL set the knot's `chainId` to null and `chainOrder` to null.
4. WHEN the user confirms removal of a knot from a chain, THE StoreService SHALL recalculate chainOrder values for the remaining knots in the chain as consecutive integers starting from 1.
5. WHEN the last knot is removed from a chain, THE StoreService SHALL delete the chain record.
6. WHEN a knot is removed from a chain, THE knot SHALL continue to exist as an independent knot with its current status unchanged.
7. IF the user cancels the removal confirmation, THEN THE StoreService SHALL not modify the knot's chain membership or chainOrder.

### Requirement 9: Chain Persistence and Integrity

**User Story:** As a user, I want my chains to be reliably saved, so that my sequence data is not lost across sessions.

#### Acceptance Criteria

1. THE StoreService SHALL include the chains array alongside knots and events in the export/backup JSON structure.
2. WHEN importing a backup JSON file that contains a chains array, THE StoreService SHALL restore chain data and validate that every knot chainId references an existing chain record, clearing any orphan chainId values that reference non-existent chains.
3. IF an imported backup JSON file does not contain a chains array, THEN THE StoreService SHALL import knots and events without error and treat the chains collection as empty.
4. WHEN a knot is deleted, THE StoreService SHALL remove the knot from its chain, recalculate chainOrder as consecutive integers starting from 1 for remaining members, and delete the chain record if no members remain.
5. WHEN a knot transitions to ARCHIVED status, THE StoreService SHALL remove the knot from its chain, recalculate chainOrder as consecutive integers starting from 1 for remaining members, and delete the chain record if no members remain.
6. THE StoreService SHALL maintain referential integrity on every persist operation by ensuring that no knot holds a chainId referencing a non-existent chain record, clearing any orphan chainId values found.

### Requirement 10: Chain Interaction from Sequence View

**User Story:** As a user, I want to interact with nudos directly from the sequence view, so that I can manage my workflow without switching views.

#### Acceptance Criteria

1. WHEN the user taps a knot node in the Chain_View, THE application SHALL open the knot detail modal for that knot and refresh the Chain_View upon modal dismissal.
2. WHILE Chain_View is active AND a knot has status UNLOCKABLE, THE Chain_View SHALL display a quick action button to start the knot (transition to DOING) by invoking `RulesService.transitionToDoing`.
3. IF the user taps the start quick action button AND `RulesService.transitionToDoing` throws an error (e.g., another knot is already DOING), THEN THE Chain_View SHALL display an alert with the error message and leave the knot status unchanged.
4. WHILE Chain_View is active AND a knot has status DOING, THE Chain_View SHALL display a quick action button to mark the knot as done and a separate quick action button to start the focus timer (via `TimerService.start` followed by opening FocusTimerModalComponent).
5. WHEN the user taps the mark-as-done quick action button from Chain_View, THE Chain_View SHALL invoke `RulesService.transitionToDone` with `feltLighter` set to `true` and update the displayed timeline within 1 second to reflect the completed knot's new DONE status and highlight the next non-DONE knot in chainOrder as the new active node.
6. IF no non-DONE knot exists in the chain after a knot is marked DONE from Chain_View, THEN THE Chain_View SHALL display the entire chain with a completed visual state and no highlighted active node.
