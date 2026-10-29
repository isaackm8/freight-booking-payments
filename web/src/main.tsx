import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './Layout.tsx';
import { ShipmentList } from './pages/ShipmentList.tsx';
import { ShipmentDetailPage } from './pages/ShipmentDetail.tsx';
import { NotFound } from './pages/NotFound.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ShipmentList />} />
          <Route path="shipments/:id" element={<ShipmentDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
