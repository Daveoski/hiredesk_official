// Copy and share helpers that also work in older or restricted browsers.

// Copies text. navigator.clipboard only exists on HTTPS pages in modern browsers, so fall back to the
// classic hidden-textarea + execCommand("copy") trick. Returns whether it worked.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the fallback
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  return copied;
}

// The phone's own share sheet (WhatsApp, SMS, Gmail...). Only some browsers have it.
export function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// Returns false if sharing isn't available or the person closed the share sheet.
export async function shareLink(title: string, text: string, url: string): Promise<boolean> {
  if (!canShare()) return false;
  try {
    await navigator.share({ title, text, url });
    return true;
  } catch {
    return false;
  }
}
