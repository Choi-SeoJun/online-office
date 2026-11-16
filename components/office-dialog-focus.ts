/** A news notice or wall board can open while its menu trigger is hidden. */
export function restoreCollapsedMenuFocus(event: Event) {
  const toggle = document.querySelector<HTMLButtonElement>('.office-sidebar-toggle[aria-expanded="false"]');
  if (toggle?.getClientRects().length) {
    event.preventDefault();
    toggle.focus();
  }
}

/** Custom dialogs also need a visible target after a responsive layout change. */
export function focusOfficeControl(control: HTMLElement | null) {
  if (control?.getClientRects().length) control.focus();
  else {
    const toggle = document.querySelector<HTMLButtonElement>('.office-sidebar-toggle');
    if (toggle?.getClientRects().length) toggle.focus();
  }
}
