import { useState, useCallback, useRef } from 'react';
import type { Conscript, Directive, Camp } from '../../shared/types';

export type EntityType = 'directive' | 'conscript' | 'camp';

export interface DragState {
  isDragging: boolean;
  sourceType: EntityType | null;
  sourceId: string | null;
}

export interface DropHandlers {
  onDragStart: (type: EntityType, id: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetType: EntityType, targetId: string, e: React.DragEvent) => void;
  canDrop: (targetType: EntityType, targetId: string) => boolean;
}

interface UseBoardDragDropOpts {
  conscripts: Conscript[];
  directives: Directive[];
  camps: Camp[];
  onAssignDirectiveToConscript: (directiveId: string, conscriptId: string) => Promise<void>;
  onAssignCampToConscript: (campId: string, conscriptId: string) => Promise<void>;
}

export interface UseBoardDragDropReturn {
  dragState: DragState;
  handlers: DropHandlers;
  cursorPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
}

export default function useBoardDragDrop(opts: UseBoardDragDropOpts): UseBoardDragDropReturn {
  const {
    conscripts, directives, camps,
    onAssignDirectiveToConscript, onAssignCampToConscript,
  } = opts;

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    sourceType: null,
    sourceId: null,
  });

  // Cursor position tracked via ref (not state) to avoid rerendering columns on every mousemove
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);

  const onDragStart = useCallback((type: EntityType, id: string, e: React.DragEvent) => {
    e.dataTransfer.setData('application/board-drag', JSON.stringify({ type, id }));
    e.dataTransfer.effectAllowed = 'link';
    setDragState({ isDragging: true, sourceType: type, sourceId: id });
  }, []);

  const onDragEnd = useCallback(() => {
    setDragState({ isDragging: false, sourceType: null, sourceId: null });
    cursorPosRef.current = null;
  }, []);

  // Track cursor position during drag for preview line
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    cursorPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const canDrop = useCallback((targetType: EntityType, targetId: string): boolean => {
    const { sourceType, sourceId } = dragState;
    if (!sourceType || !sourceId) return false;
    if (sourceType === targetType && sourceId === targetId) return false;

    // Directive → Conscript (conscript must be IDLE)
    if (sourceType === 'directive' && targetType === 'conscript') {
      const conscript = conscripts.find((c) => c.id === targetId);
      return conscript?.status === 'IDLE';
    }

    // Camp → Conscript (conscript must be IDLE)
    if (sourceType === 'camp' && targetType === 'conscript') {
      const conscript = conscripts.find((c) => c.id === targetId);
      return conscript?.status === 'IDLE';
    }

    // Conscript → Directive (conscript must be IDLE, directive backlog/ready)
    if (sourceType === 'conscript' && targetType === 'directive') {
      const conscript = conscripts.find((c) => c.id === sourceId);
      const directive = directives.find((d) => d.id === targetId);
      return conscript?.status === 'IDLE' && (directive?.status === 'backlog' || directive?.status === 'ready');
    }

    // Conscript → Camp (conscript must be IDLE, camp available)
    if (sourceType === 'conscript' && targetType === 'camp') {
      const conscript = conscripts.find((c) => c.id === sourceId);
      const camp = camps.find((o) => o.id === targetId);
      return conscript?.status === 'IDLE' && camp?.status === 'available';
    }

    return false;
  }, [dragState, conscripts, directives, camps]);

  const onDrop = useCallback(async (targetType: EntityType, targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/board-drag');
    if (!raw) return;

    let source: { type: EntityType; id: string };
    try { source = JSON.parse(raw); } catch { return; }

    // Normalize: always resolve to (directiveId, conscriptId) or (campId, conscriptId)
    try {
      if (source.type === 'directive' && targetType === 'conscript') {
        await onAssignDirectiveToConscript(source.id, targetId);
      } else if (source.type === 'camp' && targetType === 'conscript') {
        await onAssignCampToConscript(source.id, targetId);
      } else if (source.type === 'conscript' && targetType === 'directive') {
        await onAssignDirectiveToConscript(targetId, source.id);
      } else if (source.type === 'conscript' && targetType === 'camp') {
        await onAssignCampToConscript(targetId, source.id);
      }
    } catch (err) {
      console.error('Drop assignment failed:', err);
    }

    // Reset drag state
    setDragState({ isDragging: false, sourceType: null, sourceId: null });
    cursorPosRef.current = null;
  }, [onAssignDirectiveToConscript, onAssignCampToConscript]);

  return {
    dragState,
    handlers: { onDragStart, onDragEnd, onDragOver, onDrop, canDrop },
    cursorPosRef,
  };
}
