function formatInline(text: string): string {
  return text
    .replace(/`([^`\n]+)`/g, '<code class="bg-black/10 px-1 rounded">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

export function formatNoteContent(content: string): string {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = escaped.split(/\r?\n/);
  const output: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      output.push(`<ul class="list-disc pl-5">${listItems.join('')}</ul>`);
      listItems = [];
    }
  }

  for (const line of lines) {
    const listItem = line.match(/^- (.*)$/);
    if (listItem) {
      listItems.push(`<li>${formatInline(listItem[1])}</li>`);
    } else {
      flushList();
      output.push(formatInline(line));
    }
  }

  flushList();
  return output.join('<br>');
}
