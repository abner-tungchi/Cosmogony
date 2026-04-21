import type { Board } from '../types/board';
import type { StickyNote } from '../types/elements';

interface UseCaseInputProperty {
  name: string;
  type: string;
  note: string;
}

interface UseCaseLink {
  type: string;
  name: string;
}

export interface UseCaseExport {
  useCase: string;
  behavior: string;
  input: UseCaseInputProperty[];
  aggregate: string;
  aggregateId: string;
  method: string;
  domainEvent: string;
  repository: string;
  links: UseCaseLink[];
  paths: string[];
}

/**
 * Export all DomainEvent notes on a Board as structured UseCaseExport JSON.
 *
 * Field derivation:
 * - useCase:      Command label (via DomainEvent.commandId)
 * - behavior:     DomainEvent.behavior
 * - input:        Command note's information[] (Property → { name, type, note })
 * - aggregate:    Entity/Aggregate label (via DomainEvent.entityId)
 * - aggregateId:  {Aggregate}Id
 * - method:       {Aggregate}.{Command label}
 * - domainEvent:  {Aggregate}Events.{DomainEvent label}
 * - repository:   {Aggregate}Repository
 * - links:        All Link records where sourceId or targetId = this DomainEvent
 * - paths:        DomainEvent.paths → resolved FlowPath names
 */
export const exportBoardToJson = (board: Board): UseCaseExport[] => {
  const domainEvents = board.notes.filter((n) => n.type === 'DomainEvent');
  const notesById = new Map<string, StickyNote>(board.notes.map((n) => [n.id, n]));
  const flowPathsById = new Map(board.flowPaths.map((fp) => [fp.id, fp]));

  return domainEvents.map((event) => {
    // Command
    const commandNote = event.commandId ? notesById.get(event.commandId) : undefined;
    const commandLabel = commandNote?.label ?? '';

    // Input properties from the Command note's information array
    const input: UseCaseInputProperty[] = (commandNote?.information ?? []).map((prop) => ({
      name: prop.attrName,
      type: prop.type,
      note: '',
    }));

    // Aggregate / Entity
    const entityOrAggregateNote = event.entityId ? notesById.get(event.entityId) : undefined;
    const aggregateLabel = entityOrAggregateNote?.label ?? '';

    // Links: find all Link records referencing this DomainEvent
    const relatedLinks: UseCaseLink[] = board.links
      .filter((link) => link.fromId === event.id || link.toId === event.id)
      .map((link) => {
        const otherId = link.fromId === event.id ? link.toId : link.fromId;
        // Resolve the other end — could be a note or a remodel
        const otherNote = notesById.get(otherId);
        if (otherNote) {
          return { type: otherNote.type, name: otherNote.label };
        }
        const otherRemodel = board.remodels.find((r) => r.id === otherId);
        if (otherRemodel) {
          return { type: 'ReadModel', name: otherRemodel.queryNote.label || otherRemodel.aggregateNote.label };
        }
        return null;
      })
      .filter((l): l is UseCaseLink => l !== null);

    // Paths: resolve IDs to names
    const paths = (event.paths ?? [])
      .map((pathId) => flowPathsById.get(pathId)?.name)
      .filter((name): name is string => name !== undefined);

    return {
      useCase: commandLabel,
      behavior: event.behavior ?? '',
      input,
      aggregate: aggregateLabel,
      aggregateId: aggregateLabel ? `${aggregateLabel}Id` : '',
      method: aggregateLabel && commandLabel ? `${aggregateLabel}.${commandLabel}` : '',
      domainEvent: aggregateLabel ? `${aggregateLabel}Events.${event.label}` : event.label,
      repository: aggregateLabel ? `${aggregateLabel}Repository` : '',
      links: relatedLinks,
      paths,
    };
  });
};
