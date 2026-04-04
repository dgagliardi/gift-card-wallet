export const THEME_STORAGE_KEY = "gift-card-wallet-theme";

export const THEME_BOOTSTRAP_SCRIPT = `(function(){
  try {
    var k=${JSON.stringify(THEME_STORAGE_KEY)};
    var s=localStorage.getItem(k);
    var dark=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark',dark);
  } catch(e) {}
})();`;
