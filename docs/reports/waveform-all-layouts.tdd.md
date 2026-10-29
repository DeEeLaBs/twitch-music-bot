# Waveform layout review: TDD evidence

Reviewed all eight layouts with actual rendered OverlayWidget markup in native Electron, normal and free positioning (16 combinations), using the eight themes across the layouts. This covers geometry with long 120:00 durations and requester/source metadata; it is not an exhaustive theme/layout Cartesian matrix. Screenshot gallery visually inspected.

RED: horizontal, compact, banner and textOnly overlapped metadata. Expanded free-positioning checks also showed clipping caused by positions being applied only in editing mode. GREEN: all 16 combinations fit time labels and waveforms within cards with at least 2px clearance from metadata. Existing narrow stacked test passes. Added bottom content reservation only when waveform exists, layout-specific insets, full available track width, tabular time figures, and no stray top margin for free waveforms. Free positions now apply in live rendering, with a vertical safety margin for progress.

TypeScript and production build pass. Personal data unchanged; installed G: frontend updated with index backup. Native gallery: waveform-layouts.png. No Git repository is present.
