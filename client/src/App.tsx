import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Calls from './pages/Calls';
import Meetings from './pages/Meetings';
import Pipeline from './pages/Pipeline';
import Accounts from './pages/Accounts';
import Contacts from './pages/Contacts';
import Proposals from './pages/Proposals';
import Tasks from './pages/Tasks';
import Targets from './pages/Targets';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuthStore();
  if (!isAdmin()) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/attendance" element={<RequireAuth><Attendance /></RequireAuth>} />
        <Route path="/calls" element={<RequireAuth><Calls /></RequireAuth>} />
        <Route path="/meetings" element={<RequireAuth><Meetings /></RequireAuth>} />
        <Route path="/pipeline" element={<RequireAuth><Pipeline /></RequireAuth>} />
        <Route path="/accounts" element={<RequireAuth><Accounts /></RequireAuth>} />
        <Route path="/contacts" element={<RequireAuth><Contacts /></RequireAuth>} />
        <Route path="/proposals" element={<RequireAuth><Proposals /></RequireAuth>} />
        <Route path="/tasks" element={<RequireAuth><Tasks /></RequireAuth>} />
        <Route path="/targets" element={<RequireAuth><Targets /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><RequireAdmin><Settings /></RequireAdmin></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
