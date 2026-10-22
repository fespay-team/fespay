export function Icon({ name }: { name: 'home' | 'grid' | 'shop' | 'chart' | 'wallet' | 'alert' | 'calendar' }) {
  const paths = {
    home: 'm3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7',
    grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
    shop: 'M4 10v11h16V10M3 10l2-7h14l2 7H3Zm6 11v-7h6v7',
    chart: 'M4 3v17h17M8 15v-4m5 4V7m5 8V4',
    wallet: 'M3 6h16v4M3 6l15-3v3M3 6v15h18V10h-7v6h7m-4-3h1',
    alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3h.01',
    calendar: 'M4 5h16v16H4V5Zm4-3v6m8-6v6M4 11h16',
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
