import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PoolListPage } from './pages/PoolListPage';
import { PoolDetailPage } from './pages/PoolDetailPage';
import { NewsPage } from './pages/NewsPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PoolListPage />} />
        <Route path="/pools/:poolId" element={<PoolDetailPage />} />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
