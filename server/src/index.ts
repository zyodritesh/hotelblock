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
import incentivesRoutes from './routes/incentives';
import notificationsRoutes from './routes/notifications';
import salesPlansRoutes from './routes/salesPlans';
import chatRoutes from './routes/chat';
import teamCallRoutes, { sweepMissedCalls } from './routes/teamCalls';
import phoneRoutes from './routes/phone';
import liveRoutes from './routes/live';
import pushRoutes from './routes/push';
import agentPortalRoutes from './routes/agentPortal';
import { initPush } from './push';

initDb();
initPush();
setInterval(sweepMissedCalls, 15000);

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
app.use('/api/incentives', incentivesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/sales-plans', salesPlansRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/team-calls', teamCallRoutes);
app.use('/api/phone', phoneRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/agent-portal', agentPortalRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const androidDir = path.join(__dirname, '../../android');
app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.type('application/json');
  res.sendFile(path.join(androidDir, 'assetlinks.json'));
});
function sendDownload(res: express.Response, file: string, name: string, type: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename=${name}`);
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(file);
}

app.get('/hotelblock.apk', (_req, res) => {
  sendDownload(res, path.join(androidDir, 'app-release-signed.apk'), 'HotelBlock-1.0.6.apk', 'application/octet-stream');
});
app.get('/HotelBlock.zip', (_req, res) => {
  sendDownload(res, path.join(androidDir, 'HotelBlock.zip'), 'HotelBlock-1.0.6.zip', 'application/zip');
});
app.get('/get-app', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Download HotelBlock</title>
</head>
<body style="margin:0;font-family:sans-serif;background:#0f172a;color:#fff">
  <main style="max-width:420px;margin:0 auto;padding:28px 20px">
    <h1 style="font-size:28px;margin:0 0 8px">HotelBlock</h1>
    <p style="color:#cbd5e1;line-height:1.5">Version 1.0.6. Pehle purani HotelBlock uninstall karo. Phir ZIP download karo, andar HotelBlock-1.0.6.apk install karo. Microphone aur notifications par Allow dabao. Team call tab bhi aati hai jab app screen par na ho.</p>
    <a href="/HotelBlock.zip" style="display:block;margin:18px 0;background:#2563eb;color:#fff;text-align:center;text-decoration:none;font-weight:700;padding:16px;border-radius:14px">Download ZIP 1.0.6</a>
    <a href="/hotelblock.apk" style="display:block;margin:0 0 18px;background:#1e293b;color:#fff;text-align:center;text-decoration:none;font-weight:700;padding:16px;border-radius:14px">Download APK 1.0.6</a>
    <p style="color:#94a3b8;font-size:14px;line-height:1.5">Customer call phone app kholti hai. Team call app ke andar connect hoti hai, timer tab chalta hai, aur call log mein save hoti hai.</p>
  </main>
</body>
</html>`);
});

// Serve built React client
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => console.log(`HotelBlock server running on http://localhost:${PORT}`));
