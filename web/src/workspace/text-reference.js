const token = /@\[([^\]\s@]+)\]/g;

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatTextResource(text, referenceId = text?.id) {
  const id = escapeAttribute(referenceId);
  const name = escapeAttribute(text?.name || referenceId);
  return `<text-resource id="${id}" name="${name}">\n### ${name}\n\n${text?.content || ""}\n</text-resource>`;
}

export function textReferenceIds(value) {
  return [...String(value || "").matchAll(token)].map((match) => match[1]);
}

export async function expandTextReferences(value, workspace) {
  const source = String(value || "");
  const references = [...new Set(textReferenceIds(source))];
  if (!references.length) return source;
  const expanded = new Map();
  for (const id of references) {
    const result = workspace.resources.borrow("text", id);
    if (!result.ok) throw result.error;
    const lease = result.value;
    try {
      const text = lease.read();
      expanded.set(id, formatTextResource(text, id));
    } finally {
      lease.release();
    }
  }
  return source.replace(token, (match, id) => expanded.get(id) || match);
}

export async function expandTextReferencesDeep(value, workspace) {
  if (typeof value === "string") return expandTextReferences(value, workspace);
  if (Array.isArray(value))
    return Promise.all(
      value.map((item) => expandTextReferencesDeep(item, workspace)),
    );
  if (value && typeof value === "object") {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          key,
          await expandTextReferencesDeep(item, workspace),
        ]),
      ),
    );
  }
  return value;
}
