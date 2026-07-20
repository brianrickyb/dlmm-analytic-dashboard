import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PoolListPage } from './pages/PoolListPage';
import { PoolDetailPage } from './pages/PoolDetailPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PoolListPage />} />
        <Route path="/pools/:poolId" element={<PoolDetailPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
