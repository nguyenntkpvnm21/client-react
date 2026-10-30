// Native ranges send many changes during a drag/held key. One gesture is one undo step.
export function historyGesture(studio, key) {
  return {
    'data-history-range': key,
    onPointerDown: () => studio.beginEditGesture(key),
    onPointerUp: () => studio.endEditGesture(key),
    onPointerCancel: () => studio.endEditGesture(key),
    onBlur: () => studio.endEditGesture(key),
    onKeyDown: (event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) studio.beginEditGesture(key); },
    onKeyUp: () => studio.endEditGesture(key),
  };
}
