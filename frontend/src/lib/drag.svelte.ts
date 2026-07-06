/**
 * Drag-to-play state. A hand card can be played by clicking it OR by dragging
 * it onto the play area; Hand.svelte drives this via pointer events and the
 * play area renders a drop-target highlight from it.
 */
export const drag = $state({
	/** cardKey of the hand card being dragged (or frozen at its drop point). */
	key: null as string | null,
	dx: 0,
	dy: 0,
	/** Pointer is down and past the drag threshold. */
	pointerActive: false,
	/** Pointer is currently over the drop zone. */
	over: false,
	/** Card is springing back to its hand slot. */
	returning: false
});

export function clearDrag() {
	drag.key = null;
	drag.dx = 0;
	drag.dy = 0;
	drag.pointerActive = false;
	drag.over = false;
	drag.returning = false;
}
