export function mermaidLabel(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(
    /[\p{Cc}\p{Zl}\p{Zp}#%;&<>`\[\]]|:(?=:|\s*$)|\\(?=u[\da-f]{4})|d(?=irection\s+(?:TB|BT|LR|RL))/giu,
    char => char === "\n" ? "<br/>" : `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
