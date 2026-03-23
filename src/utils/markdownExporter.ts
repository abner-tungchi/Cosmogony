import type { Board } from '../types/board';
import type { StickyNote } from '../types/elements';

function getTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    DomainEvent: '⚡',
    Command: '📋',
    Aggregate: '📦',
    Policy: '📜',
    ExternalSystem: '🔌',
    Actor: '👤',
    ReadModel: '📊',
    Hotspot: '❓',
    Diamond: '◆',
  };
  return emojis[type] || '📌';
}

function findNearest(
  note: StickyNote,
  candidates: StickyNote[],
  direction: 'left' | 'right'
): StickyNote | null {
  const filtered = candidates.filter((c) =>
    direction === 'left' ? c.position.x < note.position.x : c.position.x > note.position.x
  );
  if (filtered.length === 0) return null;
  filtered.sort((a, b) =>
    direction === 'left'
      ? b.position.x - a.position.x
      : a.position.x - b.position.x
  );
  const closest = filtered.filter(
    (c) => Math.abs(c.position.y - note.position.y) < 200
  );
  return closest[0] || filtered[0];
}

function getLabelForId(id: string, board: Board): string {
  const note = board.notes.find((n) => n.id === id);
  if (note) return `${note.type}: ${note.label}`;
  const remodel = board.remodels?.find((r) => r.id === id);
  if (remodel) return `Remodel: ${remodel.queryNote.label || remodel.aggregateNote.label}`;
  return id;
}

export function exportToMarkdown(board: Board): string {
  const lines: string[] = [];
  lines.push(`# Event Storming: ${board.name}`);
  lines.push('');
  lines.push(`> Generated on ${new Date().toLocaleString()}`);
  lines.push('');

  // DomainEvent flows section — show linked Command and Entity
  const domainEvents = board.notes.filter((n) => n.type === 'DomainEvent');
  if (domainEvents.length > 0) {
    lines.push('## Domain Event Flows');
    lines.push('');
    for (const event of domainEvents) {
      lines.push(`### ${event.label || '(unnamed event)'}`);
      if (event.commandId) {
        const cmdNote = board.notes.find((n) => n.id === event.commandId);
        if (cmdNote) {
          lines.push(`- **Command**: ${cmdNote.label}`);
          if (cmdNote.information && cmdNote.information.length > 0) {
            lines.push(`- **Parameters**:`);
            for (const prop of cmdNote.information) {
              lines.push(`  - ${prop.attrName}: ${prop.type}`);
            }
          }
        }
      }
      if (event.entityId) {
        const entityNote = board.notes.find((n) => n.id === event.entityId);
        if (entityNote) {
          lines.push(`- **Entity/Aggregate**: ${entityNote.label}`);
        }
      }
      if (event.eventProperties && event.eventProperties.length > 0) {
        lines.push(`- **Event Properties**:`);
        for (const prop of event.eventProperties) {
          lines.push(`  - ${prop.attrName}: ${prop.type}`);
        }
      }
      lines.push('');
    }
  }

  // Remodels section
  if (board.remodels && board.remodels.length > 0) {
    lines.push('## Remodels');
    lines.push('');
    for (const remodel of board.remodels) {
      const queryLabel = remodel.queryNote.label || '(unnamed)';
      lines.push(`### ${queryLabel}`);
      lines.push(`- **Aggregate**: ${remodel.aggregateNote.label || '—'}${remodel.aggregateNote.content ? ' — ' + remodel.aggregateNote.content : ''}`);
      lines.push(`- **Parameters**: ${remodel.parameterNote.label || '—'}${remodel.parameterNote.content ? ' — ' + remodel.parameterNote.content : ''}`);
      lines.push(`- **Query**: ${remodel.queryNote.label || '—'}${remodel.queryNote.content ? ' — ' + remodel.queryNote.content : ''}`);
      lines.push(`- **Return Type**: ${remodel.returnTypeNote.label || '—'}${remodel.returnTypeNote.content ? ' — ' + remodel.returnTypeNote.content : ''}`);
      lines.push('');
    }
  }

  // Connections section
  if (board.links && board.links.length > 0) {
    lines.push('## Connections');
    lines.push('');
    for (const link of board.links) {
      const fromLabel = getLabelForId(link.fromId, board);
      const toLabel = getLabelForId(link.toId, board);
      const labelPart = link.label ? ` _(${link.label})_` : '';
      lines.push(`- [${fromLabel}] → [${toLabel}]${labelPart}`);
    }
    lines.push('');
  }

  const notesSortedByX = [...board.notes].sort(
    (a, b) => a.position.x - b.position.x
  );

  const regularNotes = notesSortedByX.filter((n) => n.type !== 'Diamond');
  const diamonds = notesSortedByX.filter((n) => n.type === 'Diamond');

  if (regularNotes.length > 0) {
    lines.push(`## ${board.name}`);
    lines.push('');

    const events = regularNotes.filter((n) => n.type === 'DomainEvent');
    const commands = regularNotes.filter((n) => n.type === 'Command');
    const aggregates = regularNotes.filter((n) => n.type === 'Aggregate');
    const actors = regularNotes.filter((n) => n.type === 'Actor');
    const policies = regularNotes.filter((n) => n.type === 'Policy');
    const externalSystems = regularNotes.filter((n) => n.type === 'ExternalSystem');
    const readModels = regularNotes.filter((n) => n.type === 'ReadModel');
    const hotspots = regularNotes.filter((n) => n.type === 'Hotspot');

    if (events.length > 0) {
      lines.push('### Events Flow');
      for (let i = 1; i <= events.length; i++) {
        const event = events[i - 1];
        const aggregate = findNearest(event, aggregates, 'left');
        const command = aggregate ? findNearest(aggregate, commands, 'left') : findNearest(event, commands, 'left');
        const actor = command ? findNearest(command, actors, 'left') : null;
        const policy = command ? findNearest(command, policies, 'left') : null;

        let chain = '';
        if (actor) chain += `[Actor: ${actor.label}] → `;
        if (policy) chain += `[Policy: ${policy.label}] → `;
        if (command) chain += `[Command: ${command.label}] → `;
        if (aggregate) chain += `[Aggregate: ${aggregate.label}] → `;
        chain += `[Event: ${event.label}]`;

        lines.push(`${i}. ${chain}`);
      }
      lines.push('');
    }

    if (externalSystems.length > 0) {
      lines.push('### External Systems');
      for (const s of externalSystems) {
        lines.push(`- 🔌 ${s.label}`);
      }
      lines.push('');
    }

    if (readModels.length > 0) {
      lines.push('### Read Models');
      for (const r of readModels) {
        lines.push(`- 📊 ${r.label}`);
      }
      lines.push('');
    }

    if (hotspots.length > 0) {
      lines.push('### Hotspots');
      for (const h of hotspots) {
        lines.push(`- ❓ ${h.label}`);
      }
      lines.push('');
    }

    lines.push('### All Elements');
    for (const note of regularNotes) {
      lines.push(`- ${getTypeEmoji(note.type)} **[${note.type}]** ${note.label}`);
    }
    lines.push('');
  }

  if (diamonds.length > 0) {
    lines.push('## Comments & Hotspots');
    lines.push('');
    for (const d of diamonds) {
      lines.push(`- ◆ ${d.label}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
