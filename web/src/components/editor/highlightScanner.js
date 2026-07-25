export function createScanner(rules) {
  const scopes = rules.scopes || {};

  function tryMatch(text, pos, patternStr) {
    if (!patternStr || pos >= text.length) return null;
    try {
      const re = new RegExp(patternStr, 'gy');
      re.lastIndex = pos;
      const m = re.exec(text);
      if (m && m.index === pos) return m;
    } catch (e) {
      console.warn('[scanner] invalid regex:', patternStr, e.message);
    }
    return null;
  }

  return function scan(text) {
    const tokens = [];
    const seenNames = new Set();
    let pos = 0;
    const stack = [];

    function scopeName() {
      return stack.length > 0 ? stack[stack.length - 1].name : 'root';
    }

    while (pos < text.length) {
      const sName = scopeName();
      const scope = scopes[sName];

      if (!scope) {
        if (stack.length) { stack.pop(); continue; }
        pos++;
        continue;
      }

      let matched = false;

      if (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.endPattern) {
          const em = tryMatch(text, pos, top.endPattern);
          if (em && em[0].length > 0) {
            tokens.push({
              from: pos, to: pos + em[0].length,
              name: top.tokenName
            });
            seenNames.add(top.tokenName);
            pos += em[0].length;
            stack.pop();
            continue;
          }
          if (pos >= text.length) break;
        }
      }

      let bestMatch = null;
      let bestLen = 0;
      let bestPat = null;
      let bestIsScope = false;

      for (const pat of (scope.patterns || [])) {
        if (pat.match) {
          const m = tryMatch(text, pos, pat.match);
          if (m && m[0].length > 0) {
            // longer match wins; same length → longer regex (more specific) wins
            const patLen = (pat.match || '').length;
            const better = m[0].length > bestLen ||
              (m[0].length === bestLen && bestPat && patLen > (bestPat.match || '').length);
            if (better) {
              bestMatch = m; bestLen = m[0].length;
              bestPat = pat; bestIsScope = false;
            }
          }
        }
        if (pat.begin) {
          const m = tryMatch(text, pos, pat.begin);
          if (m && m[0].length > 0) {
            const patLen = (pat.begin || '').length;
            const better = m[0].length > bestLen ||
              (m[0].length === bestLen && bestPat &&
               patLen > ((bestPat.begin || bestPat.match) || '').length);
            if (better) {
              bestMatch = m; bestLen = m[0].length;
              bestPat = pat; bestIsScope = true;
            }
          }
        }
      }

      if (bestMatch && bestLen > 0) {
        tokens.push({
          from: pos, to: pos + bestLen,
          name: bestPat.name
        });
        seenNames.add(bestPat.name);

        if (bestIsScope && bestPat.scope) {
          stack.push({
            name: bestPat.scope,
            endPattern: bestPat.end || null,
            tokenName: bestPat.name
          });
        }
        pos += bestLen;
        matched = true;
        continue;
      }

      pos++;
    }

    return {
      tokens,
      tokenNames: Array.from(seenNames)
    };
  };
}
