import React from 'react';
import logoUrl from '../icon.png';

export default function MainContent() {
  return (
    <div className="main-content">
      <div className="main-content-placeholder">
        <img src={logoUrl} alt="SweatShop" />
        <h2>Browser pane will load here</h2>
        <p>Camp URL will appear when conscript reaches QA_READY</p>
      </div>
    </div>
  );
}
