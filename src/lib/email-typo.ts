/**
 * "Did you mean …@gmail.com?" for the guest checkout email.
 *
 * Guest checkout does not verify the address, so a typo there means the order
 * confirmation silently goes nowhere. Almost all of those typos are a handful
 * of misspellings of a handful of domains, so this is an explicit list rather
 * than fuzzy matching — fuzzy matching would "correct" real domains
 * (yahoo.co.in, rediff.com, a company's own) into the popular ones.
 *
 * Returns the corrected address, or null when there is nothing to suggest.
 */

const DOMAIN_FIXES: Record<string, string> = {
  // gmail.com — by a distance the most used here
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.cim": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmail.in": "gmail.com",
  "gmail.co.in": "gmail.com",
  "gmailcom": "gmail.com",
  "g.mail.com": "gmail.com",
  "googlemail.co": "googlemail.com",
  // yahoo
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "yaho.co.in": "yahoo.co.in",
  "yahoo.coin": "yahoo.co.in",
  // microsoft
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "outlook.co": "outlook.com",
  // apple
  "icloud.con": "icloud.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
  // rediff
  "redifmail.com": "rediffmail.com",
  "rediffmail.con": "rediffmail.com",
};

export function suggestEmailFix(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const fixed = DOMAIN_FIXES[domain];
  return fixed ? `${local}@${fixed}` : null;
}
