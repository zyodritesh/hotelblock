import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDb } from './db';

import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import callsRoutes from './routes/calls';
import meetingsRoutes from './routes/meetings';
import accountsRoutes from './routes/accounts';
import contactsRoutes from './routes/contacts';
import leadsRoutes from './routes/leads';
import tasksRoutes from './routes/tasks';
import proposalsRoutes from './routes/proposals';
import attendanceRoutes from './routes/attendance';
import targetsRoutes from './routes/targets';
import reportsRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import propertiesRoutes from './routes/properties';
import agentsRoutes from './routes/agents';
import catalogRoutes from './routes/catalog';

initDb();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
// Serve nested upload dirs
app.use('/uploads/logos', express.static(path.join(__dirname, '../../uploads/logos')));
app.use('/uploads/proposals', express.static(path.join(__dirname, '../../uploads/proposals')));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/targets', targetsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/catalog', catalogRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve built React client
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => console.log(`HotelBlock server running on http://localhost:${PORT}`));
