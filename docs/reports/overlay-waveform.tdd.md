# Stacked waveform overflow: TDD evidence

An absolutely positioned waveform had width:100% plus a 16px left inset, ignoring its right inset and placing its total-time label beyond the clipped card. It now uses width:auto with both insets. The track may shrink, and free-positioning waveforms use their draggable container rather than the card insets.

RED: Native hidden Electron browser measured timeRight=335.20 for cardRight=320, failing the right-padding assertion. GREEN: At 320 and 280px widths, even a 120:00 label fits with at least 15px right padding. Seven focused tests, TypeScript and production build pass. Installed G: frontend patched with index backup; personal data unchanged. No Git repository available.
