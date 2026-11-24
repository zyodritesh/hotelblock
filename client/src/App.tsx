import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Calls from './pages/Calls';
import Meetings from './pages/Meetings';
import Travel from './pages/Travel';
import Pipeline from './pages/Pipeline';
import Calendar from './pages/Calendar';
import Phone from './pages/Phone';
import Chat from './pages/Chat';
import Accounts from './pages/Accounts';
import Contacts from './pages/Contacts';
import Proposals from './pages/Proposals';
import Tasks from './pages/Tasks';
import Targets from './pages/Targets';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Agents from './pages/Agents';
import AgentDue from './pages/AgentDue';
import Wallet from './pages/Wallet';
import AgentPortal from './pages/AgentPortal';
import AgentOffers from './pages/AgentOffers';
import AppInstalls from './pages/AppInstalls';
import AgentRewards from './pages/AgentRewards';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace />;
  const onAgentPortal = location.pathname === '/agent';
  if (user?.role === 'agent' && !onAgentPortal) return <Navigate to="/agent" replace />;
  if (user?.role !== 'agent' && onAgentPortal) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuthStore();
  if (!isAdmin()) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireManager({ children }: { children: React.ReactNode }) {
  const { isManager } = useAuthStore();
  if (!isManager()) return <Navigate to="/" replace />;
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
        <Route path="/travel" element={<RequireAuth><Travel /></RequireAuth>} />
        <Route path="/pipeline" element={<RequireAuth><Pipeline /></RequireAuth>} />
        <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
        <Route path="/phone" element={<RequireAuth><Phone /></RequireAuth>} />
        <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="/chat/c/:conversationId" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="/chat/:userId" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="/accounts" element={<RequireAuth><Accounts /></RequireAuth>} />
        <Route path="/contacts" element={<RequireAuth><Contacts /></RequireAuth>} />
        <Route path="/proposals" element={<RequireAuth><Proposals /></RequireAuth>} />
        <Route path="/tasks" element={<RequireAuth><Tasks /></RequireAuth>} />
        <Route path="/targets" element={<RequireAuth><Targets /></RequireAuth>} />
        <Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><RequireAdmin><Settings /></RequireAdmin></RequireAuth>} />
        <Route path="/agent" element={<RequireAuth><AgentPortal /></RequireAuth>} />
        <Route path="/agent-offers" element={<RequireAuth><AgentOffers /></RequireAuth>} />
        <Route path="/app-installs" element={<RequireAuth><RequireManager><AppInstalls /></RequireManager></RequireAuth>} />
        <Route path="/agent-rewards" element={<RequireAuth><AgentRewards /></RequireAuth>} />
        <Route path="/agents" element={<RequireAuth><Agents /></RequireAuth>} />
        <Route path="/agents/due" element={<RequireAuth><AgentDue /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
