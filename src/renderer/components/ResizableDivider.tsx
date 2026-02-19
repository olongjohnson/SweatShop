import React, { useCallback, useRef, useEffect, useState } from 'react';

interface ResizableDividerProps {
  direction: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
}

export default function ResizableDivider({ direction, onResize }: ResizableDividerProps) {
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    lastPos.current = direction === 'vertical' ? e.clientX : e.clientY;
  }, [direction]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const current = direction === 'vertical' ? e.clientX : e.clientY;
      const delta = current - lastPos.current;
      lastPos.current = current;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, direction, onResize]);

  return (
    <div
      className={`resizable-divider ${direction} ${dragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    />
  );
}
