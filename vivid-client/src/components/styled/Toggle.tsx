import React from 'react';
import './Toggle.css';

export function ToggleButton(props: { children: any }) {
  return (
    <label className="toggleSwitch">
      <input type="checkbox" className="toggleSwitchInput"/>
      <span className="toggleContainer"></span>
      {props.children ? (
        <span className="toggleLabel">{props.children}</span>
      ) : null}
    </label>
  );
}
