import React, { useEffect, useState, useCallback } from 'react';
import type { Directive, Conscript, Camp } from '../../shared/types';
import type { DragState } from '../hooks/useBoardDragDrop';

interface Line {
  key: string;
  path: string;
  className: string;
}

interface Props {
  columnsRef: React.RefObject<HTMLDivElement | null>;
  directives: Directive[];
  conscripts: Conscript[];
  camps: Camp[];
  dragState: DragState;
  cursorPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
}

function getCardRect(container: HTMLElement, entityType: string, entityId: string) {
  const card = container.querySelector(
    `[data-entity-type="${entityType}"][data-entity-id="${entityId}"]`
  );
  if (!card) return null;
  const cr = card.getBoundingClientRect();
  const br = container.getBoundingClientRect();
  return {
    left: cr.left - br.left,
    right: cr.right - br.left,
    top: cr.top - br.top,
    bottom: cr.bottom - br.top,
    cx: cr.left - br.left + cr.width / 2,
    cy: cr.top - br.top + cr.height / 2,
  };
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.45;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export default function BoardConnectionLines({
  columnsRef, directives, conscripts, camps, dragState, cursorPosRef,
}: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [previewLine, setPreviewLine] = useState<string | null>(null);

  const recalculate = useCallback(() => {
    const container = columnsRef.current;
    if (!container) return;

    const newLines: Line[] = [];

    // Draw lines for each conscript's assignments
    for (const conscript of conscripts) {
      // Directive → Conscript line
      if (conscript.assignedDirectiveId) {
        const dRect = getCardRect(container, 'directive', conscript.assignedDirectiveId);
        const cRect = getCardRect(container, 'conscript', conscript.id);
        if (dRect && cRect) {
          newLines.push({
            key: `d-${conscript.assignedDirectiveId}-c-${conscript.id}`,
            path: bezierPath(dRect.right, dRect.cy, cRect.left, cRect.cy),
            className: 'board-connection-line board-connection-line--active',
          });
        }
      }

      // Conscript → Camp line
      if (conscript.assignedCampAlias) {
        const camp = camps.find((o) => o.assignedConscriptIds.includes(conscript.id));
        if (camp) {
          const cRect = getCardRect(container, 'conscript', conscript.id);
          const oRect = getCardRect(container, 'camp', camp.id);
          if (cRect && oRect) {
            newLines.push({
              key: `c-${conscript.id}-o-${camp.id}`,
              path: bezierPath(cRect.right, cRect.cy, oRect.left, oRect.cy),
              className: 'board-connection-line board-connection-line--active',
            });
          }
        }
      }
    }

    setLines(newLines);
  }, [columnsRef, conscripts, camps]);

  // Recalculate on data change
  useEffect(() => {
    recalculate();
  }, [recalculate, directives, conscripts, camps]);

  // Recalculate on scroll and resize
  useEffect(() => {
    const container = columnsRef.current;
    if (!container) return;

    const scrollBodies = container.querySelectorAll('.board-column-body');
    const onScroll = () => requestAnimationFrame(recalculate);

    scrollBodies.forEach((el) => el.addEventListener('scroll', onScroll, { passive: true }));
    window.addEventListener('resize', onScroll);

    return () => {
      scrollBodies.forEach((el) => el.removeEventListener('scroll', onScroll));
      window.removeEventListener('resize', onScroll);
    };
  }, [columnsRef, recalculate]);

  // Preview line during drag — RAF loop reads cursorPosRef
  useEffect(() => {
    if (!dragState.isDragging || !dragState.sourceType || !dragState.sourceId) {
      setPreviewLine(null);
      return;
    }

    let rafId: number;
    const tick = () => {
      const container = columnsRef.current;
      const cursor = cursorPosRef.current;
      if (container && cursor) {
        const srcRect = getCardRect(container, dragState.sourceType!, dragState.sourceId!);
        if (srcRect) {
          const br = container.getBoundingClientRect();
          const cx = cursor.x - br.left;
          const cy = cursor.y - br.top;
          // Start from the appropriate edge based on cursor position
          const startX = cx > srcRect.cx ? srcRect.right : srcRect.left;
          setPreviewLine(bezierPath(startX, srcRect.cy, cx, cy));
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [dragState.isDragging, dragState.sourceType, dragState.sourceId, columnsRef, cursorPosRef]);

  return (
    <svg className="board-svg-overlay">
      {lines.map((line) => (
        <path key={line.key} d={line.path} className={line.className} />
      ))}
      {previewLine && (
        <path d={previewLine} className="board-connection-line board-connection-line--preview" />
      )}
    </svg>
  );
}
