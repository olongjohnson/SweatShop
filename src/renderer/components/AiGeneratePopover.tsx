import React, { useState, useRef, useEffect } from 'react';

type EntityType = 'directive' | 'identity' | 'workflow';

interface AiGeneratePopoverProps {
  entityType: EntityType;
  onGenerate: (freeformText: string) => Promise<void>;
  generating: boolean;
}

const PLACEHOLDERS: Record<EntityType, string> = {
  directive: 'Describe the work you need done...\n\ne.g. "Build an Apex trigger on Account that validates phone numbers before insert, with test coverage and error handling"',
  identity: 'Describe the kind of agent you want...\n\ne.g. "A senior Apex developer who specializes in trigger patterns and bulk-safe code. Should be thorough and write tests."',
  workflow: 'Describe the pipeline you want...\n\ne.g. "A standard dev flow: first refine the requirements, then implement the code, then do a code review before human approval"',
};

const LABELS: Record<EntityType, string> = {
  directive: 'Describe this directive',
  identity: 'Describe this identity',
  workflow: 'Describe this workflow',
};

export default function AiGeneratePopover({ entityType, onGenerate, generating }: AiGeneratePopoverProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        if (!generating) setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, generating]);

  const handleSubmit = async () => {
    if (!text.trim() || generating) return;
    await onGenerate(text.trim());
    setOpen(false);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && !generating) {
      setOpen(false);
    }
  };

  return (
    <div className="ai-popover-container" ref={popoverRef}>
      <button
        type="button"
        className="ai-popover-trigger"
        onClick={() => setOpen(!open)}
        disabled={generating}
        title="Generate with AI"
      >
        {generating ? (
          <span className="ai-popover-spinner" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        )}
      </button>

      {open && (
        <div className="ai-popover-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="ai-popover-label">{LABELS[entityType]}</div>
          <textarea
            ref={textareaRef}
            className="ai-popover-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[entityType]}
            rows={6}
            disabled={generating}
          />
          {generating && (
            <div className="ai-popover-status">Generating...</div>
          )}
          <div className="ai-popover-footer">
            <span className="ai-popover-hint">{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to generate</span>
            <button
              type="button"
              className="btn-primary ai-popover-submit"
              onClick={handleSubmit}
              disabled={!text.trim() || generating}
            >
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
