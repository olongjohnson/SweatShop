import React from 'react';
import logoUrl from './icon.png';

function App() {
  const api = window.sweatshop;

  return (
    <div className="app">
      <div className="container">
        <img src={logoUrl} alt="SweatShop" className="logo" />
        <h1>SweatShop</h1>
        <p>AI Agent Orchestrator for Salesforce Development</p>
        <div className="versions">
          Chrome {api?.versions.chrome} | Node {api?.versions.node} | Electron{' '}
          {api?.versions.electron}
        </div>
      </div>
    </div>
  );
}

export default App;
