function formatInline(text: string): string {
  return text
    .replace(/`([^`\n]+)`/g, '<code class="bg-black/10 px-1 rounded">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

export type NoteContentBlock =
  | { type: 'text'; content: string }
  | { type: 'checklist'; lineIndex: number; text: string; checked: boolean };

const checklistLinePattern = /^- \[([ xX])\] (.*)$/;

export function getNoteContentBlocks(content: string): NoteContentBlock[] {
  const blocks: NoteContentBlock[] = [];
  const textLines: string[] = [];
  const lines = content.split(/\r?\n/);

  function flushText() {
    if (textLines.length > 0) {
      blocks.push({ type: 'text', content: textLines.join('\n') });
      textLines.length = 0;
    }
  }

  lines.forEach((line, lineIndex) => {
    const checklistLine = line.match(checklistLinePattern);
    if (!checklistLine) {
      textLines.push(line);
      return;
    }

    flushText();
    blocks.push({
      type: 'checklist',
      lineIndex,
      text: checklistLine[2],
      checked: checklistLine[1].toLowerCase() === 'x'
    });
  });

  flushText();
  return blocks;
}

export function toggleChecklistItem(content: string, lineIndex: number): string {
  const lines = content.split(/\r?\n/);
  const line = lines[lineIndex];
  const checklistLine = line?.match(checklistLinePattern);
  if (!checklistLine) return content;

  lines[lineIndex] = `- [${checklistLine[1].toLowerCase() === 'x' ? ' ' : 'x'}] ${checklistLine[2]}`;
  return lines.join('\n');
}

export function formatNoteContent(content: string): string {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = escaped.split(/\r?\n/);
  const output: string[] = [];
  let listItems: string[] = [];
  let checklistItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      output.push(`<ul class="list-disc pl-5">${listItems.join('')}</ul>`);
      listItems = [];
    }
  }

  function flushChecklist() {
    if (checklistItems.length > 0) {
      output.push(`<ul class="list-none pl-0 space-y-0.5">${checklistItems.join('')}</ul>`);
      checklistItems = [];
    }
  }

  for (const line of lines) {
    const checklistItem = line.match(/^- \[([ xX])\] (.*)$/);
    if (checklistItem) {
      flushList();
      const checked = checklistItem[1].toLowerCase() === 'x';
      checklistItems.push(
        `<li class="flex items-start gap-1"><span aria-hidden="true">${checked ? '☑' : '☐'}</span><span class="${checked ? 'line-through opacity-60' : ''}">${formatInline(checklistItem[2])}</span></li>`
      );
      continue;
    }

    flushChecklist();
    const listItem = line.match(/^- (.*)$/);
    if (listItem) {
      listItems.push(`<li>${formatInline(listItem[1])}</li>`);
    } else {
      flushList();
      output.push(formatInline(line));
    }
  }

  flushList();
  flushChecklist();
  return output.join('<br>');
}
