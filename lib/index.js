/**
 * Host half of dsh-zoom-viewer.
 *
 * The plugin is browser-only: it registers an image renderer with the host
 * document-previews registry on the client side. This entry exists so the
 * loader row resolves to a valid plugin.
 */
export const name = "dsh-zoom-viewer";

export const inject = [];

export function apply() {}
