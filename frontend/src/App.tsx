import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { Layout } from './components/Layout';
import { PoolListPage } from './pages/PoolListPage';
import { PoolDetailPage } from './pages/PoolDetailPage';
import { NewsPage } from './pages/NewsPage';
import { ScreenerPage } from './pages/ScreenerPage';
import { FaqPage } from './pages/FaqPage';
import { SignupPage } from './pages/SignupPage';
import { LoginPage } from './pages/LoginPage';
import { AccountPage } from './pages/AccountPage';
import { UpgradePage } from './pages/UpgradePage';

function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<PoolListPage />} />
          <Route path="/pools/:poolId" element={<PoolDetailPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/screener" element={<ScreenerPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}

export default App;
