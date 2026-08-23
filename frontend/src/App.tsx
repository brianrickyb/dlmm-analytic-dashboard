import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { WalletContextProvider } from './lib/wallet/WalletContextProvider';
import { PositionsRefreshProvider } from './lib/positionsRefresh';
import { AuthProvider } from './lib/auth/AuthContext';
import { Layout } from './components/Layout';
import { PoolListPage } from './pages/PoolListPage';

// Route-level code splitting: wallet adapters + recharts are heavy, and bundling
// every page eagerly produced a >500kB minified chunk. The home page stays eager
// (first paint / LCP); everything else loads on navigation.
const PoolDetailPage = lazy(() => import('./pages/PoolDetailPage').then((m) => ({ default: m.PoolDetailPage })));
const NewsPage = lazy(() => import('./pages/NewsPage').then((m) => ({ default: m.NewsPage })));
const ScreenerPage = lazy(() => import('./pages/ScreenerPage').then((m) => ({ default: m.ScreenerPage })));
const FaqPage = lazy(() => import('./pages/FaqPage').then((m) => ({ default: m.FaqPage })));
const SignupPage = lazy(() => import('./pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const MyPositionsPage = lazy(() => import('./pages/MyPositionsPage').then((m) => ({ default: m.MyPositionsPage })));
const MarketSignalPage = lazy(() => import('./pages/MarketSignalPage').then((m) => ({ default: m.MarketSignalPage })));

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
      Loading…
    </div>
  );
}

function App() {
  return (
    <WalletContextProvider>
      <PositionsRefreshProvider>
        <AuthProvider>
          <Layout>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<PoolListPage />} />
                <Route path="/pools/:poolId" element={<PoolDetailPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/screener" element={<ScreenerPage />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/positions" element={<MyPositionsPage />} />
                <Route path="/markets/xau" element={<MarketSignalPage />} />
              </Routes>
            </Suspense>
          </Layout>
        </AuthProvider>
      </PositionsRefreshProvider>
    </WalletContextProvider>
  );
}

export default App;
