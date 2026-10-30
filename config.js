// Settings for the norming survey. Edit the values on the right of each colon.
// After editing, upload this file to GitHub again.

const CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby1FsAJN8-erj-2Hoi-uPLnEnoFMRU4g-C-kjC17kx5Bc1G53wQoXIsVqeE-dng14F5Eg/exec',          // paste the Apps Script web app URL (ends in /exec) between the quotes
  TOKEN: 'HjD4EQrX9fvb7Hq7t4BRjLKOPlw5IpI5J78IVS0N', // already the same as TOKEN in Code.gs; change both or neither
  SURVEY_ID: 'norming',    // namespaces localStorage keys and row IDs
  SURVEY_VERSION: '1.0.0',
  LOW_RATING_MAX: 4,       // meaning ratings at or below this open the suggestion box
  MID_BREAK_SECONDS: 120,  // break after the familiarity task: seconds before "Tiếp tục" can be pressed (0 = no wait)
};
