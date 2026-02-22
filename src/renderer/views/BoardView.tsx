import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Directive, Conscript, Camp, OrchestratorStatus } from '../../shared/types';
import BoardDirectiveColumn from '../components/BoardDirectiveColumn';
import BoardConscriptColumn from '../components/BoardConscriptColumn';
import BoardCampColumn from '../components/BoardCampColumn';
import BoardConnectionLines from '../components/BoardConnectionLines';
import StoryForm from '../components/StoryForm';
import useBoardDragDrop from '../hooks/useBoardDragDrop';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

interface BoardViewProps {
  onInspectCamp?: (alias: string) => void;
  onAddConscript: () => void;
  onCloseConscript: (id: string) => void;
}

export default function BoardView({ onInspectCamp, onAddConscript, onCloseConscript }: BoardViewProps) {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [conscripts, setConscripts] = useState<Conscript[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [orchStatus, setOrchStatus] = useState<OrchestratorStatus | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  // StoryForm modal
  const [editingDirective, setEditingDirective] = useState<Directive | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadDirectives = useCallback(async () => {
    const list = await window.sweatshop.directives.list();
    setDirectives(list);
  }, []);

  const loadConscripts = useCallback(async () => {
    const list = await window.sweatshop.conscripts.list();
    setConscripts(list);
  }, []);

  const loadCamps = useCallback(async () => {
    const list = await window.sweatshop.camps.list();
    setCamps(list);
  }, []);

  // Initial load
  useEffect(() => {
    loadDirectives();
    loadConscripts();
    loadCamps();
    window.sweatshop.orchestrator.getStatus().then(setOrchStatus);
    window.sweatshop.orchestrator.onProgress(setOrchStatus);
  }, [loadDirectives, loadConscripts, loadCamps]);

  // Subscribe to conscript status changes
  useEffect(() => {
    window.sweatshop.conscripts.onStatusChanged(() => {
      loadConscripts();
      loadCamps();
    });
  }, [loadConscripts, loadCamps]);

  const handleCreateDirective = () => {
    setEditingDirective(null);
    setShowForm(true);
  };

  const handleEditDirective = (directive: Directive) => {
    setEditingDirective(directive);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingDirective(null);
    loadDirectives();
  };

  const handleRefreshAll = useCallback(() => {
    loadDirectives();
    loadConscripts();
    loadCamps();
  }, [loadDirectives, loadConscripts, loadCamps]);

  // Lifted assignment logic for drag-and-drop
  const assignDirectiveToConscript = useCallback(async (directiveId: string, conscriptId: string) => {
    const directive = directives.find((d) => d.id === directiveId);
    if (!directive) return;

    const branchName = `conscript/${slugify(directive.title)}`;

    const promptParts = [
      `# ${directive.title}`,
      '',
      directive.description,
      '',
      directive.acceptanceCriteria ? `## Acceptance Criteria\n${directive.acceptanceCriteria}` : '',
    ].filter(Boolean);

    // Include context from previous attempts
    const history = await window.sweatshop.chat.history(conscriptId);
    if (history.length > 0) {
      const contextMessages = history
        .filter((m) => m.role !== 'system' || m.content.includes('Rework') || m.content.includes('scrapped'))
        .slice(-20)
        .map((m) => `[${m.role}]: ${m.content}`)
        .join('\n');
      promptParts.push('', '## Previous Attempt Context', 'This directive was previously worked on. Use this context to iterate:', '', contextMessages);
    }

    const settings = await window.sweatshop.settings.get();
    const workingDirectory = settings.git?.workingDirectory || '';

    await window.sweatshop.conscripts.assign(conscriptId, directiveId, {
      campAlias: '',
      branchName,
      refinedPrompt: promptParts.join('\n'),
      workingDirectory,
    });

    handleRefreshAll();
  }, [directives, handleRefreshAll]);

  const assignCampToConscript = useCallback(async (campId: string, conscriptId: string) => {
    // Unassign current camp from conscript if any
    const currentCamp = camps.find((o) => o.assignedConscriptIds.includes(conscriptId));
    if (currentCamp) {
      await window.sweatshop.camps.unassignFromConscript(currentCamp.id, conscriptId);
    }
    await window.sweatshop.camps.assignToConscript(campId, conscriptId);
    handleRefreshAll();
  }, [camps, handleRefreshAll]);

  const { dragState, handlers, cursorPosRef } = useBoardDragDrop({
    conscripts,
    directives,
    camps,
    onAssignDirectiveToConscript: assignDirectiveToConscript,
    onAssignCampToConscript: assignCampToConscript,
  });

  return (
    <div className="board-view" onDragOver={handlers.onDragOver}>
      {showForm && (
        <StoryForm
          directive={editingDirective}
          allDirectives={directives}
          onClose={handleFormClose}
        />
      )}

      {/* Orchestrator status bar */}
      {orchStatus && orchStatus.total > 0 && (
        <div className={`orchestrator-bar ${orchStatus.running ? 'running' : 'stopped'}`}>
          <span className="orchestrator-bar-text">
            {orchStatus.running ? 'Dispatching' : 'Queue'}:{' '}
            {orchStatus.completed}/{orchStatus.total} complete,{' '}
            {orchStatus.inProgress} in progress,{' '}
            {orchStatus.pending} pending
          </span>
          {orchStatus.running && (
            <button
              className="btn-secondary orchestrator-stop-btn"
              onClick={() => window.sweatshop.orchestrator.stop()}
            >
              Stop
            </button>
          )}
        </div>
      )}

      <div className="board-columns" ref={columnsRef}>
        <BoardDirectiveColumn
          directives={directives}
          conscripts={conscripts}
          onCreateDirective={handleCreateDirective}
          onEditDirective={handleEditDirective}
          onRefresh={loadDirectives}
          dragHandlers={handlers}
          dragState={dragState}
        />
        <div className="board-divider" />
        <BoardConscriptColumn
          conscripts={conscripts}
          directives={directives}
          camps={camps}
          onRefresh={handleRefreshAll}
          onAddConscript={onAddConscript}
          onCloseConscript={onCloseConscript}
          dragHandlers={handlers}
          dragState={dragState}
        />
        <div className="board-divider" />
        <BoardCampColumn
          conscripts={conscripts}
          directives={directives}
          onRefresh={handleRefreshAll}
          onInspectCamp={onInspectCamp}
          dragHandlers={handlers}
          dragState={dragState}
        />
        <BoardConnectionLines
          columnsRef={columnsRef}
          directives={directives}
          conscripts={conscripts}
          camps={camps}
          dragState={dragState}
          cursorPosRef={cursorPosRef}
        />
      </div>
    </div>
  );
}
