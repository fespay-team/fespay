import { useState, type ReactNode } from 'react';

const tabs = [{ id: 'guide', label: '案内設定' }, { id: 'settings', label: '業務設定' }] as const;
export type SettingsTab = typeof tabs[number]['id'];
const initialTab: SettingsTab = 'guide';
type SettingsTabsContent = { guide: ReactNode; settings: ReactNode };

// Only the selected section lives here; all editing and save state stays in the existing editor.
export function SettingsTabs(content: SettingsTabsContent) {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>(initialTab);
  return <SettingsTabsView {...content} selectedTab={selectedTab} onSelect={setSelectedTab} />;
}

export function SettingsTabsView({ guide, settings, selectedTab = initialTab, onSelect }: SettingsTabsContent & {
  selectedTab?: SettingsTab; onSelect: (tab: SettingsTab) => void;
}) {
  return <>
    <div className="mg-settings-tabs" role="tablist" aria-label="イベント設定の切替">
      {tabs.map(tab => <button key={tab.id} id={`m02-${tab.id}-tab`} type="button" role="tab" className="mg-settings-tab"
        aria-selected={selectedTab === tab.id} aria-controls={`m02-${tab.id}-panel`} onClick={() => onSelect(tab.id)}>{tab.label}</button>)}
    </div>
    <p className="mg-note mg-settings-tab-current" aria-live="polite">現在の編集：{tabs.find(tab => tab.id === selectedTab)!.label}</p>
    {tabs.map(tab => <div key={tab.id} id={`m02-${tab.id}-panel`} role="tabpanel" className="mg-settings-tab-panel"
      aria-labelledby={`m02-${tab.id}-tab`} hidden={selectedTab !== tab.id}>
      {selectedTab === tab.id && <>
        {tab.id === 'guide' ? guide : settings}
        <button type="button" className="mg-button mg-settings-tab-switch" onClick={event => {
          const nextTab = tab.id === 'guide' ? 'settings' : 'guide';
          onSelect(nextTab);
          event.currentTarget.ownerDocument.getElementById(`m02-${nextTab}-tab`)?.focus();
        }}>{tab.id === 'guide' ? '業務設定へ →' : '← 案内設定へ'}</button>
      </>}
    </div>)}
  </>;
}
