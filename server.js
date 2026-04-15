import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';

const app = express();
app.use(express.json());
app.use(express.static('public'));

let lastUpdate = 0;
let updating = false;
let progress = 0;

// update (1 hour limit)
app.post('/api/update', async (req, res) => {
  const now = Date.now();
  if (now - lastUpdate < 3600000) {
    return res.json({ error: 'Можно раз в час' });
  }

  updating = true;
  progress = 0;

  for (let i = 0; i <= 100; i += 5) {
    progress = i;
    await new Promise(r => setTimeout(r, 100));
  }

  lastUpdate = now;
  updating = false;

  res.json({ ok: true });
});

app.get('/api/update-status', (req, res) => {
  res.json({
    updating,
    progress,
    next: Math.max(0, 3600000 - (Date.now() - lastUpdate))
  });
});

app.post('/api/reset-update', (req, res) => {
  updating = false;
  progress = 0;
  res.json({ ok: true });
});

// image compression
app.get('/api/image', async (req, res) => {
  try {
    const url = req.query.url;
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    const img = await sharp(Buffer.from(buffer))
      .resize(240)
      .webp({ quality: 40 })
      .toBuffer();

    res.set('Content-Type', 'image/webp');
    res.send(img);

  } catch {
    res.status(404).send('');
  }
});

app.listen(3000, () => console.log('ZAN 1.0 running'));