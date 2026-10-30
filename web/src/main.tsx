import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { Layout } from './Layout.tsx';
import { ShipmentList } from './pages/ShipmentList.tsx';
import { ShipmentDetailPage } from './pages/ShipmentDetail.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { CashFlowHub } from './pages/CashFlowHub.tsx';
import { WhyCashBridge } from './pages/WhyCashBridge.tsx';
import { AuditLog } from './pages/AuditLog.tsx';
import { ReviewQueue } from './pages/ReviewQueue.tsx';

// The home address opens the story. The shipment list used to live at "/", so an old list link
// with filters (e.g. /?decision=held_for_review) goes to /shipments with the same filters.
function Home() {
  const { search } = useLocation();
  return <Navigate to={search ? `/shipments${search}` : '/why-cashbridge'} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shipments" element={<ShipmentList />} />
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
