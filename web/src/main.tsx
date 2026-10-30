import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './Layout.tsx';
import { ShipmentList } from './pages/ShipmentList.tsx';
import { ShipmentDetailPage } from './pages/ShipmentDetail.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { CashFlowHub } from './pages/CashFlowHub.tsx';
import { WhyCashBridge } from './pages/WhyCashBridge.tsx';
import { AuditLog } from './pages/AuditLog.tsx';
import { ReviewQueue } from './pages/ReviewQueue.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ShipmentList />} />
          <Route path="cash-flow-hub" element={<CashFlowHub />} />
          <Route path="why-cashbridge" element={<WhyCashBridge />} />
          <Route path="audit-log" element={<AuditLog />} />
          <Route path="review-queue" element={<ReviewQueue />} />
          {/* The page was called Dashboard at first; keep old links working. */}
          <Route path="dashboard" element={<Navigate to="/cash-flow-hub" replace />} />
          {/* How it works became part of Why CashBridge. */}
          <Route path="how-it-works" element={<Navigate to="/why-cashbridge" replace />} />
          <Route path="shipments/:id" element={<ShipmentDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
