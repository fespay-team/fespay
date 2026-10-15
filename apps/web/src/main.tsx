import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('root element is missing');
createRoot(root).render(<main><h1>FesPay</h1><p>イベント決済のサービスを準備しています。</p></main>);
