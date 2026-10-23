export const THEME_STORAGE_KEY = "hireplume-theme";
export const AUTH_STORAGE_KEY = "hireplume-auth";

// Keys saved before the HireDesk -> HirePlume rename. The boot script moves them to the new
// names once, so nobody is signed out or loses their theme choice.
const RENAMED_KEYS: [string, string][] = [
  ["hiredesk-theme", THEME_STORAGE_KEY],
  ["hiredesk-auth", AUTH_STORAGE_KEY],
];
const moveRenamedKeys = RENAMED_KEYS.map(
  ([from, to]) => `var o=s.getItem("${from}");if(o!==null){if(s.getItem("${to}")===null)s.setItem("${to}",o);s.removeItem("${from}")}`,
).join(";");

// Runs in <head> before the page paints, so a dark-mode visitor never sees a white flash.
// It also runs before the sign-in store loads, so the renamed keys are in place first.
export const themeBootScript = `(function(){try{var s=localStorage;${moveRenamedKeys};var t=s.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
