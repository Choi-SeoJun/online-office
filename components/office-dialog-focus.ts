/** A news notice or wall board can open while its menu trigger is hidden. */
export function restoreCollapsedMenuFocus(event: Event) {
  const toggle = document.querySelector<HTMLButtonElement>('.office-sidebar-toggle[aria-expanded="false"]');
  if (toggle?.getClientRects().length) {
    event.preventDefault();
    toggle.focus();
  }
}
