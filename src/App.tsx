import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Shell } from '@/components/layout/Shell';
import { Dashboard } from '@/pages/Dashboard';
import { Portfolio } from '@/pages/Portfolio';
import { Radar } from '@/pages/Radar';
import { Opportunities } from '@/pages/Opportunities';
import { RegimePage } from '@/pages/RegimePage';
import { Stocks } from '@/pages/Stocks';
import { Watchlist } from '@/pages/Watchlist';
import { Bubbles } from '@/pages/Bubbles';
import { DeepChart } from '@/pages/DeepChart';
import { Monitor } from '@/pages/Monitor';
import { TopHunter } from '@/pages/TopHunter';
import { Social } from '@/pages/Social';
import { News } from '@/pages/News';
import { MoneyFlow } from '@/pages/MoneyFlow';
import { Derivatives } from '@/pages/Derivatives';
import { Alerts } from '@/pages/Alerts';
import { Favorites } from '@/pages/Favorites';
import { BacktestingPage } from '@/pages/BacktestingPage';
import { Training } from '@/pages/Training';
import { Settings } from '@/pages/Settings';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/radar" element={<Radar />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/regime" element={<RegimePage />} />
          <Route path="/stocks" element={<Stocks />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/bubbles" element={<Bubbles />} />
          <Route path="/deepchart" element={<DeepChart />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/tophunter" element={<TopHunter />} />
          <Route path="/social" element={<Social />} />
          <Route path="/news" element={<News />} />
          <Route path="/moneyflow" element={<MoneyFlow />} />
          <Route path="/derivatives" element={<Derivatives />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/backtesting" element={<BacktestingPage />} />
          <Route path="/training" element={<Training />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
