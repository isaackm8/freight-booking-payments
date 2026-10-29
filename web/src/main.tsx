import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './Layout.tsx';
import { ShipmentList } from './pages/ShipmentList.tsx';
import { ShipmentDetailPage } from './pages/ShipmentDetail.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { CashFlowHub } from './pages/CashFlowHub.tsx';
import { HowItWorks } from './pages/HowItWorks.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ShipmentList />} />
          <Route path="cash-flow-hub" element={<CashFlowHub />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          {/* The page was called Dashboard at first; keep old links working. */}
          <Route path="dashboard" element={<Navigate to="/cash-flow-hub" replace />} />
          <Route path="shipments/:id" element={<ShipmentDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
